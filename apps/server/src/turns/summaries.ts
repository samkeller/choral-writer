import { eq, inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { LlmClient } from '@choral/engine';
import { branchEvents } from '../memory.js';
import { summaries, turns } from '../schema.js';
import { config, type AgentRow, type Project, type Turn } from './context-data.js';

export async function compactSummaries(
  db: NodePgDatabase,
  client: LlmClient,
  project: Project,
  turn: Turn,
  agent: AgentRow,
) {
  const history = await branchEvents(db, project.id, turn.branchId!);
  const ids = history
    .filter((event) => event.category === 'narrative')
    .map((event) => event.turnId)
    .filter((id): id is string => !!id);
  if (!ids.length) return;
  const visible = new Set(ids);
  const previous = (await db.select().from(summaries).where(eq(summaries.projectId, project.id))).filter(
    (summary) => summary.sourceIds.length && summary.sourceIds.every((id) => visible.has(id)),
  );
  const covered = new Set(
    previous.filter((summary) => summary.level === 1).flatMap((summary) => summary.sourceIds),
  );
  const unsummarized = (
    await db.select().from(turns).where(inArray(turns.id, ids)).orderBy(turns.seq)
  ).filter((item) => item.prose && !covered.has(item.id));
  if (unsummarized.length >= 5) {
    const batch = unsummarized.slice(0, 5);
    const summary = await client.complete({
      projectId: project.id,
      turnId: turn.id,
      agentId: agent.id,
      purpose: 'summary',
      model: agent.model,
      maxTokens: 1000,
      timeoutMs: config(agent).params.timeout_ms,
      messages: [
        {
          role: 'system',
          content:
            'Résume fidèlement ces tours à la troisième personne. Préserve la chronologie, les tensions et le ton. Ne crée aucun fait.',
        },
        { role: 'user', content: batch.map((item) => `Tour ${item.seq}: ${item.prose}`).join('\n\n') },
      ],
    });
    const [row] = await db
      .insert(summaries)
      .values({
        projectId: project.id,
        branchId: turn.branchId!,
        level: 1,
        fromTurn: batch[0].seq,
        toTurn: batch.at(-1)!.seq,
        text: summary,
        sourceIds: batch.map((item) => item.id),
      })
      .onConflictDoNothing()
      .returning();
    if (row) previous.push(row);
  }
  const highCovered = new Set(
    previous.filter((summary) => summary.level === 2).flatMap((summary) => summary.sourceIds),
  );
  const lower = previous
    .filter((summary) => summary.level === 1 && summary.sourceIds.every((id) => !highCovered.has(id)))
    .sort((a, b) => a.fromTurn - b.fromTurn);
  if (lower.length >= 5) {
    const batch = lower.slice(0, 5);
    const summary = await client.complete({
      projectId: project.id,
      turnId: turn.id,
      agentId: agent.id,
      purpose: 'summary',
      model: agent.model,
      maxTokens: 1200,
      timeoutMs: config(agent).params.timeout_ms,
      messages: [
        {
          role: 'system',
          content:
            'Résume fidèlement ces résumés chronologiques. Préserve les événements, les tensions et le ton sans inventer.',
        },
        { role: 'user', content: batch.map((item) => item.text).join('\n\n') },
      ],
    });
    await db
      .insert(summaries)
      .values({
        projectId: project.id,
        branchId: turn.branchId!,
        level: 2,
        fromTurn: batch[0].fromTurn,
        toTurn: batch.at(-1)!.toTurn,
        text: summary,
        sourceIds: batch.flatMap((item) => item.sourceIds),
      })
      .onConflictDoNothing();
  }
}
