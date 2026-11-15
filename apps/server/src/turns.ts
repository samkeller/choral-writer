import { and, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  buildContext,
  envelopeSchema,
  interpretationSchema,
  NarrationParser,
  proposalsSchema,
  resolutionSchema,
  TracePersistenceError,
  type Interpretation,
  type LlmClient,
  type Resolution,
} from '@choral/engine';
import { proposalInstructions, shouldRun } from './agents.js';
import {
  applyProposals,
  assertNoActiveTurn,
  DomainError,
  ensureBranch,
  lockedProject,
  nextTurnSeq,
} from './memory.js';
import {
  agents,
  events,
  globalSettings,
  llmCalls,
  memoryProjections,
  projects,
  turns,
  whiteboardEntries,
} from './schema.js';
import { BudgetError } from './budget.js';
import {
  agentByPurpose,
  baseData,
  callOptions,
  config,
  recoverResponse,
  requestedDays,
  type Turn,
} from './turns/context-data.js';
import { compactSummaries } from './turns/summaries.js';
type Send = (event: string, value: unknown) => void;

const interpretationInstructions =
  'Réponds uniquement en JSON : {"controlled":[{"character":"clé","action":"..."}],"intentions":["..."],"entities":["clé"],"time_scale":"moment|jours|mois|années","meta_direction":null ou texte}.';
const envelopeInstructions =
  'Réponds uniquement en JSON : {"analysis":"...","constraints":["..."],"notes":["..."],"remember":[{"text":"...","about":["clé"],"importance":"LOW|MEDIUM|HIGH"}]}.';
const narrationInstructions =
  'Réponds exactement avec <resolution>{"happened":[{"text":"...","participants":["clé"],"location":"clé ou null"}],"time":{"label":"...","elapsed_days":0}}</resolution><prose>Le récit</prose>. Résolution valide avant la prose. Écris une à deux pages.';

export async function createTurn(
  db: NodePgDatabase,
  projectId: string,
  userInput: string,
  metaDirection?: string,
) {
  return db.transaction(async (tx) => {
    const project = await lockedProject(tx, projectId);
    await assertNoActiveTurn(tx, projectId);
    if (!project.worldInitialized) throw new DomainError('Initialize the world before starting a turn', 409);
    const branch = await ensureBranch(tx, projectId, project.activeBranchId);
    const [turn] = await tx
      .insert(turns)
      .values({
        projectId,
        branchId: branch.branchId,
        seq: await nextTurnSeq(tx, projectId),
        userInput,
        metaDirection,
        status: 'pending',
      })
      .returning();
    return turn;
  });
}

async function setStatus(
  db: NodePgDatabase,
  turnId: string,
  status: string,
  values: Partial<typeof turns.$inferInsert> = {},
) {
  await db
    .update(turns)
    .set({ ...values, status })
    .where(eq(turns.id, turnId));
}

export async function runTurn(db: NodePgDatabase, client: LlmClient, turn: Turn, send: Send) {
  const [project] = await db.select().from(projects).where(eq(projects.id, turn.projectId));
  if (!project || !turn.branchId) throw new Error('Project or branch not found');
  const [projection] = await db
    .select()
    .from(memoryProjections)
    .where(eq(memoryProjections.branchId, turn.branchId));
  if (!projection) throw new Error('Missing projection');
  const rows = await db.select().from(agents).where(eq(agents.projectId, project.id));
  const [settings] = await db.select().from(globalSettings).where(eq(globalSettings.key, 'instructions'));
  if (!settings) throw new Error('Global instructions not configured');
  const globalInstructions = settings.value;
  const resumeStage = turn.status;
  let narrated = resumeStage === 'narrated' || resumeStage === 'guarding';
  try {
    if (narrated) {
      if (resumeStage === 'guarding') await setStatus(db, turn.id, 'narrated', { error: null });
      await runGuardian(db, client, { ...turn, status: 'narrated' }, send);
      return;
    }
    await setStatus(db, turn.id, 'interpreting');
    send('status', { status: 'interpreting', turnId: turn.id });
    const interpreter = agentByPurpose(rows, 'interpreter');
    const raw = {
      raw: turn.userInput + (turn.metaDirection ? `\nDirection méta : ${turn.metaDirection}` : ''),
    };
    const initialData = await baseData(db, project, turn, projection.state, raw);
    let interpretation: Interpretation | { raw: string };
    try {
      const prompt = buildContext(
        [
          globalInstructions,
          project.instructions,
          `${interpreter.systemPrompt}\n${interpretationInstructions}`,
        ],
        initialData,
        config(interpreter).context,
        'interpreter',
      );
      const saved = interpretationSchema.safeParse(turn.interpretation);
      if (saved.success) {
        interpretation = saved.data;
      } else if (
        turn.interpretation &&
        typeof turn.interpretation === 'object' &&
        'raw' in turn.interpretation &&
        typeof turn.interpretation.raw === 'string'
      ) {
        interpretation = { raw: turn.interpretation.raw };
      } else {
        const recovered =
          resumeStage !== 'pending'
            ? await recoverResponse(db, turn.id, interpreter.id, 'interpreter', interpretationSchema)
            : undefined;
        interpretation =
          recovered ??
          (await client.complete({
            ...callOptions(project, turn, interpreter, prompt, 'interpreter'),
            schema: interpretationSchema,
          }));
      }
    } catch (error) {
      if (error instanceof TracePersistenceError || error instanceof BudgetError) throw error;
      send('warning', {
        stage: 'interpreter',
        message: error instanceof Error ? error.message : 'Interprétation impossible',
      });
      interpretation = raw;
    }
    await setStatus(db, turn.id, 'analyzing', { interpretation });
    send('status', { status: 'analyzing' });
    const data = await baseData(db, project, turn, projection.state, interpretation);
    const stored = await db.select().from(whiteboardEntries).where(eq(whiteboardEntries.turnId, turn.id));
    const analysisRows = rows.filter(
      (row) =>
        row.enabled &&
        row.kind === 'analysis' &&
        shouldRun(
          config(row),
          data.focus,
          data.turnNumber,
          Math.max(
            data.lastElapsedDays,
            'time_scale' in interpretation ? requestedDays(interpretation.time_scale) : 0,
          ),
        ),
    );
    const analyses = await Promise.allSettled(
      analysisRows.map(async (row) => {
        try {
          const existing = stored.find((entry) => entry.agentId === row.id);
          if (existing) {
            if (existing.status === 'succeeded')
              return { agent: row.key, envelope: envelopeSchema.parse(existing.envelope) };
            if (row.required) throw new Error(existing.error ?? 'Required analysis failed');
            return null;
          }
          const prompt = buildContext(
            [globalInstructions, project.instructions, `${row.systemPrompt}\n${envelopeInstructions}`],
            data,
            config(row).context,
            'analysis',
          );
          const recovered =
            resumeStage !== 'pending'
              ? await recoverResponse(db, turn.id, row.id, 'analysis', envelopeSchema)
              : undefined;
          const envelope =
            recovered ??
            (await client.complete({
              ...callOptions(project, turn, row, prompt, 'analysis'),
              schema: envelopeSchema,
            }));
          await db
            .insert(whiteboardEntries)
            .values({ turnId: turn.id, agentId: row.id, envelope, status: 'succeeded' });
          return { agent: row.key, envelope };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Analysis failed';
          if (!stored.some((entry) => entry.agentId === row.id)) {
            await db
              .insert(whiteboardEntries)
              .values({ turnId: turn.id, agentId: row.id, status: 'failed', error: message });
          }
          if (row.required || error instanceof TracePersistenceError || error instanceof BudgetError)
            throw error;
          send('warning', { stage: 'analysis', agent: row.key, message });
          return null;
        }
      }),
    );
    const failure = analyses.find((item): item is PromiseRejectedResult => item.status === 'rejected');
    if (failure) throw failure.reason;
    const whiteboard = analyses.flatMap((item) =>
      item.status === 'fulfilled' && item.value ? [item.value] : [],
    );
    await setStatus(db, turn.id, 'narrating');
    send('status', { status: 'narrating' });
    const narrator = agentByPurpose(rows, 'narrator');
    const prompt = buildContext(
      [globalInstructions, project.instructions, `${narrator.systemPrompt}\n${narrationInstructions}`],
      { ...data, whiteboard },
      config(narrator).context,
      'output',
    );
    let prose = '';
    let resolution: Resolution | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const parser = new NarrationParser((chunk) => {
          prose += chunk;
          send('prose', { text: chunk });
        });
        const prior =
          resumeStage !== 'pending' && attempt === 0
            ? await db
                .select()
                .from(llmCalls)
                .where(
                  and(
                    eq(llmCalls.turnId, turn.id),
                    eq(llmCalls.purpose, 'narrator'),
                    eq(llmCalls.status, 'succeeded'),
                  ),
                )
                .orderBy(llmCalls.createdAt)
            : [];
        if (prior.length && prior.at(-1)?.response) {
          await parser.push(prior.at(-1)!.response!);
        } else {
          await client.stream(
            callOptions(project, turn, narrator, prompt, 'narrator'),
            (chunk) => parser.push(chunk),
            false,
          );
        }
        resolution = parser.finish();
        if (!prose.trim()) throw new Error('Narrator returned empty prose');
        break;
      } catch (error) {
        if (error instanceof TracePersistenceError || error instanceof BudgetError || prose || attempt === 1)
          throw error;
        send('warning', { stage: 'narrator', message: 'Nouvelle tentative du narrateur' });
      }
    }
    if (!resolution) throw new Error('Narration failed');
    await setStatus(db, turn.id, 'narrated', {
      resolution,
      prose,
      storyTimeLabel: resolution.time.label,
      elapsedDays: String(resolution.time.elapsed_days),
      error: null,
    });
    narrated = true;
    send('status', { status: 'narrated' });
    await runGuardian(db, client, { ...turn, interpretation, resolution, prose, status: 'narrated' }, send);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown turn error';
    await setStatus(db, turn.id, narrated ? 'narrated' : 'failed', { error: message });
    send('error', { message, retryGuardian: narrated });
  }
}

export async function runGuardian(db: NodePgDatabase, client: LlmClient, turn: Turn, send: Send) {
  const [claimed] = await db
    .update(turns)
    .set({ status: 'guarding', error: null })
    .where(and(eq(turns.id, turn.id), eq(turns.status, 'narrated')))
    .returning();
  if (!claimed) throw new DomainError('Turn is not available for guardian retry', 409);
  send('status', { status: 'guarding' });
  try {
    const [project] = await db.select().from(projects).where(eq(projects.id, turn.projectId));
    const [projection] = await db
      .select()
      .from(memoryProjections)
      .where(eq(memoryProjections.branchId, turn.branchId!));
    const rows = await db.select().from(agents).where(eq(agents.projectId, turn.projectId));
    const [settings] = await db.select().from(globalSettings).where(eq(globalSettings.key, 'instructions'));
    if (!settings) throw new Error('Global instructions not configured');
    const globalInstructions = settings.value;
    const guardian = agentByPurpose(rows, 'guardian');
    const resolution = resolutionSchema.parse(turn.resolution);
    if (!turn.prose || !project || !projection) throw new Error('Narrated turn is incomplete');
    const interpretation = interpretationSchema.safeParse(turn.interpretation);
    const rawInterpretation = interpretation.success ? interpretation.data : { raw: turn.userInput };
    const data = await baseData(db, project, turn, projection.state, rawInterpretation);
    const entries = await db.select().from(whiteboardEntries).where(eq(whiteboardEntries.turnId, turn.id));
    const whiteboard = entries
      .filter((entry) => entry.status === 'succeeded')
      .map((entry) => ({
        agent: rows.find((row) => row.id === entry.agentId)?.key,
        envelope: entry.envelope,
      }));
    const prompt = buildContext(
      [
        globalInstructions,
        project.instructions,
        `${guardian.systemPrompt}\n${proposalInstructions}\nRéponds en JSON {"proposals":[...]}.
Résolution : ${JSON.stringify(resolution)}\nProse : ${turn.prose}`,
      ],
      { ...data, whiteboard },
      config(guardian).context,
      'output',
    );
    const recovered = await recoverResponse(db, turn.id, guardian.id, 'guardian', proposalsSchema);
    const output =
      recovered ??
      (await client.complete({
        ...callOptions(project, turn, guardian, prompt, 'guardian'),
        schema: proposalsSchema,
      }));
    const result = await db.transaction(async (tx) => {
      const locked = await lockedProject(tx, project.id);
      if (locked.activeBranchId !== turn.branchId) throw new Error('Branch changed during turn');
      const [current] = await tx
        .select()
        .from(memoryProjections)
        .where(eq(memoryProjections.branchId, turn.branchId!));
      const narrativeSeq = locked.lastEventSeq + 1;
      await tx.insert(events).values({
        projectId: project.id,
        branchId: turn.branchId!,
        turnId: turn.id,
        seq: narrativeSeq,
        category: 'narrative',
        type: 'resolved',
        payload: resolution,
        source: 'narrator',
      });
      const reduced = await applyProposals(tx, {
        projectId: project.id,
        branchId: turn.branchId!,
        state: current.state,
        nextSeq: narrativeSeq,
        turnId: turn.id,
        inputs: output.proposals,
        author: 'guardian',
        evidence: turn.prose!,
        resolution,
      });
      await tx
        .update(projects)
        .set({ storyClockDays: sql`${projects.storyClockDays} + ${resolution.time.elapsed_days}` })
        .where(eq(projects.id, project.id));
      await tx
        .update(turns)
        .set({ status: 'committed', committedAt: new Date(), error: null })
        .where(eq(turns.id, turn.id));
      return reduced;
    });
    try {
      await compactSummaries(db, client, project, turn, guardian);
    } catch (error) {
      send('warning', {
        stage: 'summary',
        message: error instanceof Error ? error.message : 'Summary failed',
      });
    }
    send('committed', { turnId: turn.id, proposals: result.results });
  } catch (error) {
    await setStatus(db, turn.id, 'narrated', {
      error: error instanceof Error ? error.message : 'Guardian failed',
    });
    throw error;
  }
}
