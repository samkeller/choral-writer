import { and, eq, inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { z } from 'zod';
import {
  type ContextData,
  type Interpretation,
  type Memory,
  type Mutation,
  type Resolution,
} from '@choral/engine';
import { agentSchema, type AgentConfig } from '../agents.js';
import { agents, llmCalls, projects, summaries, turns } from '../schema.js';
import { branchEvents } from '../memory.js';

export type AgentRow = typeof agents.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Turn = typeof turns.$inferSelect;

export function config(row: AgentRow): AgentConfig {
  return agentSchema.parse({
    key: row.key,
    name: row.name,
    kind: row.kind,
    system_prompt: row.systemPrompt,
    model: row.model,
    params: row.params,
    context: row.contextSpec,
    schedule: row.schedule,
    required: row.required,
    enabled: row.enabled,
  });
}

export function callOptions(project: Project, turn: Turn, row: AgentRow, prompt: string, purpose: string) {
  const agent = config(row);
  return {
    projectId: project.id,
    turnId: turn.id,
    agentId: row.id,
    purpose,
    model: row.model,
    messages: [{ role: 'system' as const, content: prompt }],
    maxTokens: agent.params.max_tokens,
    temperature: agent.params.temperature,
    timeoutMs: agent.params.timeout_ms,
  };
}

export function agentByPurpose(rows: AgentRow[], purpose: 'interpreter' | 'narrator' | 'guardian') {
  const row = rows.find(
    (item) =>
      item.enabled &&
      (purpose === 'interpreter'
        ? item.kind === 'interpreter'
        : item.kind === 'output' && config(item).params.purpose === purpose),
  );
  if (!row) throw new Error(`Missing ${purpose} agent`);
  return row;
}

export async function baseData(
  db: NodePgDatabase,
  project: Project,
  turn: Turn,
  memory: Memory,
  interpretation: Interpretation | { raw: string },
) {
  const history = await branchEvents(db, project.id, turn.branchId!);
  const narrative = history.filter((event) => event.category === 'narrative');
  const previous = narrative.at(-1)?.payload as Resolution | undefined;
  const controlled =
    'controlled' in interpretation ? interpretation.controlled.map((item) => item.character) : [];
  const locations = new Set(
    memory.entities
      .filter((entity) => controlled.includes(entity.key))
      .map((entity) => entity.attributes.location)
      .filter(Boolean),
  );
  const focus = [
    ...new Set([
      ...('entities' in interpretation ? interpretation.entities : []),
      ...controlled,
      ...memory.entities
        .filter((entity) => locations.has(entity.attributes.location))
        .map((entity) => entity.key),
      ...(previous?.happened ?? []).flatMap((event) => event.participants),
    ]),
  ];
  const historyTurns = narrative.map((event) => event.turnId).filter((id): id is string => Boolean(id));
  const pastTurns = historyTurns.length
    ? await db.select().from(turns).where(inArray(turns.id, historyTurns)).orderBy(turns.seq)
    : [];
  const historyIds = new Set(historyTurns);
  const storedSummaries = await db.select().from(summaries).where(eq(summaries.projectId, project.id));
  const eligibleSummaries = storedSummaries.filter(
    (item) => item.sourceIds.length > 0 && item.sourceIds.every((id) => historyIds.has(id)),
  );
  const analysisHistory = pastTurns.map((item) => ({
    turn: item.seq,
    entries: history
      .filter((event) => event.turnId === item.id && event.category === 'mutation')
      .flatMap<NonNullable<ContextData['analysis_history']>[number]['entries'][number]>((event) => {
        const mutation = event.payload as Mutation;
        const proposal = mutation.proposal;
        if ((proposal.op === 'add_fact' || proposal.op === 'supersede_fact') && mutation.assignedRef) {
          return [{ fact_ref: mutation.assignedRef }];
        }
        if (proposal.op === 'set_knowledge') {
          return [
            {
              character: proposal.character,
              fact_ref: proposal.fact_ref,
              content: proposal.content,
              status: proposal.status,
              is_false: proposal.is_false,
            },
          ];
        }
        return [];
      }),
  }));
  return {
    memory,
    interpretation,
    focus,
    turnNumber: narrative.length + 1,
    lastElapsedDays: previous?.time.elapsed_days ?? 0,
    events: narrative.flatMap((event) =>
      ((event.payload as { happened?: Resolution['happened'] }).happened ?? []).map((item) => ({
        text: item.text,
        participants: item.participants,
      })),
    ),
    summaries: eligibleSummaries.map((item) => ({
      level: item.level,
      from_turn: item.fromTurn,
      to_turn: item.toTurn,
      text: item.text,
    })),
    analysis_history: analysisHistory,
    prose: pastTurns.filter((item) => item.prose).map((item) => ({ turn: item.seq, text: item.prose! })),
  };
}

export function requestedDays(scale: string): number {
  const value = scale.toLocaleLowerCase('fr');
  if (/\b(ans?|années?)\b/u.test(value)) return 365;
  if (value.includes('mois')) return 30;
  if (value.includes('semaine')) return 7;
  if (value.includes('jour')) return 1;
  return 0;
}

export async function recoverResponse<T>(
  db: NodePgDatabase,
  turnId: string,
  agentId: string,
  purpose: string,
  schema: z.ZodType<T>,
): Promise<T | undefined> {
  const calls = await db
    .select()
    .from(llmCalls)
    .where(
      and(
        eq(llmCalls.turnId, turnId),
        eq(llmCalls.agentId, agentId),
        eq(llmCalls.purpose, purpose),
        eq(llmCalls.status, 'succeeded'),
      ),
    )
    .orderBy(llmCalls.createdAt);
  for (const call of calls.reverse()) {
    if (!call.response) continue;
    let value: unknown;
    try {
      value = JSON.parse(call.response);
    } catch {
      continue;
    }
    const parsed = schema.safeParse(value);
    if (parsed.success) return parsed.data;
  }
  return undefined;
}
