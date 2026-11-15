import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { llmCalls, projects, proposals, turns, whiteboardEntries } from '../schema.js';
import { branchEvents, DomainError } from '../memory.js';
import { createTurn, runGuardian, runTurn } from '../turns.js';
import { withProjectExecutionLock } from '../locks.js';
import type { RouteDependencies } from './types.js';
import { projectIdSchema } from './types.js';

export function registerTurnRoutes(app: FastifyInstance, { db, client }: RouteDependencies) {
  app.get('/api/projects/:id/turns', async (request, reply) => {
    const params = projectIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid project ID' });
    const [project] = await db.select().from(projects).where(eq(projects.id, params.data.id));
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    if (!project.activeBranchId) return [];
    const history = await branchEvents(db, project.id, project.activeBranchId);
    const ids = history
      .filter((event) => event.category === 'narrative')
      .map((event) => event.turnId)
      .filter((id): id is string => !!id);
    const allTurns = await db.select().from(turns).where(eq(turns.projectId, project.id)).orderBy(turns.seq);
    return allTurns.filter(
      (turn) =>
        ids.includes(turn.id) || (turn.branchId === project.activeBranchId && turn.status !== 'committed'),
    );
  });
  app.post('/api/projects/:id/turns', async (request, reply) => {
    const params = projectIdSchema.safeParse(request.params);
    const body = z
      .object({
        userInput: z.string().trim().min(1).max(20000),
        metaDirection: z.string().max(5000).optional(),
      })
      .strict()
      .safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'Invalid request' });
    try {
      return await withProjectExecutionLock(db.$client, params.data.id, async () => {
        const turn = await createTurn(db, params.data.id, body.data.userInput, body.data.metaDirection);
        reply.hijack();
        reply.raw.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache, no-transform',
          'x-accel-buffering': 'no',
        });
        const send = (event: string, value: unknown) => {
          if (!reply.raw.destroyed) reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
        };
        try {
          await runTurn(db, client, turn, send);
        } catch (error) {
          request.log.error(error, 'Turn failed');
          await db
            .update(turns)
            .set({ status: 'failed', error: 'Turn initialization failed' })
            .where(eq(turns.id, turn.id));
          send('error', { message: 'Turn initialization failed' });
        }
      });
    } finally {
      if (reply.raw.headersSent && !reply.raw.writableEnded) reply.raw.end();
    }
  });
  app.get('/api/turns/:id/debug', async (request, reply) => {
    const params = projectIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid turn ID' });
    const [turn] = await db.select().from(turns).where(eq(turns.id, params.data.id));
    if (!turn) return reply.code(404).send({ error: 'Turn not found' });
    const [whiteboard, calls, changes] = await Promise.all([
      db.select().from(whiteboardEntries).where(eq(whiteboardEntries.turnId, turn.id)),
      db.select().from(llmCalls).where(eq(llmCalls.turnId, turn.id)).orderBy(llmCalls.createdAt),
      db.select().from(proposals).where(eq(proposals.turnId, turn.id)),
    ]);
    return { turn, whiteboard, calls, proposals: changes };
  });
  app.post('/api/turns/:id/retry-guardian', async (request, reply) => {
    const params = projectIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid turn ID' });
    const [turn] = await db.select().from(turns).where(eq(turns.id, params.data.id));
    if (!turn) return reply.code(404).send({ error: 'Turn not found' });
    return withProjectExecutionLock(db.$client, turn.projectId, async () => {
      const messages: { event: string; value: unknown }[] = [];
      await runGuardian(db, client, turn, (event, value) => messages.push({ event, value }));
      return { messages };
    });
  });
  app.post('/api/turns/:id/resume', async (request, reply) => {
    const params = projectIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid turn ID' });
    const [existing] = await db.select().from(turns).where(eq(turns.id, params.data.id));
    if (!existing) return reply.code(404).send({ error: 'Turn not found' });
    return withProjectExecutionLock(db.$client, existing.projectId, async () => {
      const [turn] = await db.select().from(turns).where(eq(turns.id, existing.id));
      if (
        !['pending', 'interpreting', 'analyzing', 'narrating', 'narrated', 'guarding'].includes(turn.status)
      ) {
        throw new DomainError('Turn cannot be resumed', 409);
      }
      const messages: { event: string; value: unknown }[] = [];
      await runTurn(db, client, turn, (event, value) => messages.push({ event, value }));
      return { messages };
    });
  });
}
