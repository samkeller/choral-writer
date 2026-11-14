import { and, eq, notInArray, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { applyMutation, emptyMemory, reduceProposal, replay, resolutionSchema, type Memory, type Mutation, type Resolution } from '@choral/engine';
import { branches, events, memoryProjections, projects, proposals, summaries, turns } from './schema.js';

type Tx = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0];
export class DomainError extends Error {
  constructor(message: string, readonly statusCode: number) { super(message); }
}

export async function lockedProject(tx: Tx, projectId: string) {
  const [project] = await tx.select().from(projects).where(eq(projects.id, projectId)).for('update');
  if (!project) throw new DomainError('Project not found', 404);
  return project;
}

export async function ensureBranch(tx: Tx, projectId: string, activeBranchId: string | null) {
  if (activeBranchId) {
    const [projection] = await tx.select().from(memoryProjections)
      .where(and(eq(memoryProjections.branchId, activeBranchId), eq(memoryProjections.projectId, projectId)));
    if (!projection) throw new Error('Missing branch projection');
    return { branchId: activeBranchId, state: projection.state };
  }
  const [branch] = await tx.insert(branches).values({ projectId }).returning();
  const state = emptyMemory();
  await tx.insert(memoryProjections).values({ branchId: branch.id, projectId, state });
  await tx.update(projects).set({ activeBranchId: branch.id }).where(eq(projects.id, projectId));
  return { branchId: branch.id, state };
}

export async function assertNoActiveTurn(tx: Tx, projectId: string) {
  const [turn] = await tx.select({ id: turns.id }).from(turns).where(and(eq(turns.projectId, projectId),
    notInArray(turns.status, ['committed', 'failed']))).limit(1);
  if (turn) throw new DomainError('A turn is already active or awaiting guardian retry', 409);
}

export async function applyProposals(tx: Tx, args: {
  projectId: string; branchId: string; state: Memory; nextSeq: number; inputs: unknown[];
  author: 'debug' | 'guardian' | 'seed'; turnId?: string; evidence?: string; resolution?: Resolution;
}) {
  let state = args.state;
  let seq = args.nextSeq;
  const results = [];
  for (const input of args.inputs) {
    const result = reduceProposal(state, input, { source: args.author, evidence: args.evidence, resolution: args.resolution });
    if (result.status === 'accepted') {
      state = applyMutation(state, result.event);
      seq++;
      await tx.insert(events).values({
        projectId: args.projectId, branchId: args.branchId, turnId: args.turnId,
        seq, category: 'mutation', type: result.event.proposal.op, payload: result.event, source: args.author
      });
    }
    const [record] = await tx.insert(proposals).values({
      projectId: args.projectId, branchId: args.branchId, turnId: args.turnId, author: args.author,
      payload: input ?? null, status: result.status,
      rejectCode: result.status === 'rejected' ? result.rejection.code : null,
      rejectDetail: result.status === 'rejected' ? result.rejection.detail : null,
      eventSeq: result.status === 'accepted' ? seq : null
    }).returning();
    results.push(record);
  }
  await tx.update(memoryProjections).set({ state }).where(eq(memoryProjections.branchId, args.branchId));
  await tx.update(projects).set({ lastEventSeq: seq }).where(eq(projects.id, args.projectId));
  return { state, seq, results };
}

export async function getMemory(db: NodePgDatabase, projectId: string) {
  return db.transaction(async tx => {
    const project = await lockedProject(tx, projectId);
    const branch = await ensureBranch(tx, projectId, project.activeBranchId);
    const history = await branchEvents(tx, projectId, branch.branchId);
    const turnIds = new Set(history.filter(event => event.category === 'narrative').map(event => event.turnId));
    const allSummaries = await tx.select().from(summaries).where(eq(summaries.projectId, projectId));
    return { ...branch, summaries: allSummaries.filter(item => item.sourceIds.length && item.sourceIds.every(id => turnIds.has(id))) };
  });
}

export async function debugProposals(db: NodePgDatabase, projectId: string, inputs: unknown[], turnId?: string) {
  return db.transaction(async tx => {
    const project = await lockedProject(tx, projectId);
    await assertNoActiveTurn(tx, projectId);
    const { branchId, state } = await ensureBranch(tx, projectId, project.activeBranchId);
    let resolution: Resolution | undefined;
    if (turnId) {
      const history = await branchEvents(tx, projectId, branchId);
      const event = history.find(item => item.turnId === turnId && item.category === 'narrative');
      if (!event) throw new DomainError('Turn not found on active branch', 404);
      resolution = resolutionSchema.parse(event.payload);
    }
    return applyProposals(tx, { projectId, branchId, state, inputs, nextSeq: project.lastEventSeq, author: 'debug', resolution });
  });
}

export async function branchEvents(db: NodePgDatabase, projectId: string, branchId: string, cutoff = Number.MAX_SAFE_INTEGER) {
  const allBranches = await db.select().from(branches).where(eq(branches.projectId, projectId));
  const lineage: { id: string; cutoff: number }[] = [];
  let current = allBranches.find(branch => branch.id === branchId);
  let limit = cutoff;
  while (current) {
    lineage.push({ id: current.id, cutoff: limit });
    limit = Math.min(limit, current.forkEventSeq);
    if (!current.parentBranchId) break;
    current = allBranches.find(branch => branch.id === current!.parentBranchId);
    if (!current) throw new Error('Broken branch ancestry');
  }
  if (!lineage.length) throw new DomainError('Branch not found', 404);
  const allEvents = await db.select().from(events).where(eq(events.projectId, projectId)).orderBy(events.seq);
  return allEvents.filter(event => lineage.some(branch => event.branchId === branch.id && event.seq <= branch.cutoff));
}

export async function nextTurnSeq(tx: Tx, projectId: string): Promise<number> {
  const [row] = await tx.select({ value: sql<number>`coalesce(max(${turns.seq}), 0)` })
    .from(turns).where(eq(turns.projectId, projectId));
  return Number(row.value) + 1;
}

export async function rewind(db: NodePgDatabase, projectId: string, turnId: string) {
  return db.transaction(async tx => {
    const project = await lockedProject(tx, projectId);
    await assertNoActiveTurn(tx, projectId);
    if (!project.activeBranchId) throw new DomainError('No active branch', 409);
    const history = await branchEvents(tx, projectId, project.activeBranchId);
    const targetEvents = history.filter(event => event.turnId === turnId);
    if (!targetEvents.some(event => event.category === 'narrative')) throw new DomainError('Turn not found on active branch', 404);
    const cutoff = Math.max(...targetEvents.map(event => event.seq));
    const selected = history.filter(event => event.seq <= cutoff);
    const state = replay(selected.filter(event => event.category === 'mutation').map(event => event.payload as Mutation));
    const clock = selected.filter(event => event.category === 'narrative').reduce((total, event) =>
      total + Number((event.payload as Resolution).time.elapsed_days), 0);
    const [branch] = await tx.insert(branches).values({
      projectId, parentBranchId: project.activeBranchId, forkEventSeq: cutoff
    }).returning();
    await tx.insert(memoryProjections).values({ branchId: branch.id, projectId, state });
    await tx.update(projects).set({ activeBranchId: branch.id, storyClockDays: String(clock) }).where(eq(projects.id, projectId));
    return branch;
  });
}

export async function switchBranch(db: NodePgDatabase, projectId: string, branchId: string) {
  return db.transaction(async tx => {
    await lockedProject(tx, projectId);
    await assertNoActiveTurn(tx, projectId);
    const [branch] = await tx.select().from(branches).where(and(eq(branches.id, branchId), eq(branches.projectId, projectId)));
    if (!branch) throw new DomainError('Branch not found', 404);
    const history = await branchEvents(tx, projectId, branchId);
    const clock = history.filter(event => event.category === 'narrative').reduce((total, event) =>
      total + Number((event.payload as Resolution).time.elapsed_days), 0);
    await tx.update(projects).set({ activeBranchId: branchId, storyClockDays: String(clock) }).where(eq(projects.id, projectId));
    return branch;
  });
}
