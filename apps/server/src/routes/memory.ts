import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { proposalsSchema } from '@choral/engine';
import { globalSettings, projects } from '../schema.js';
import {
  applyProposals,
  assertNoActiveTurn,
  debugProposals,
  DomainError,
  ensureBranch,
  getMemory,
  lockedProject,
} from '../memory.js';
import { proposalInstructions } from '../agents.js';
import { withProjectExecutionLock } from '../locks.js';
import type { RouteDependencies } from './types.js';
import { projectIdSchema } from './types.js';

export function registerMemoryRoutes(app: FastifyInstance, { db, client, settings }: RouteDependencies) {
  app.get('/api/projects/:id/memory', async (request, reply) => {
    const params = projectIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid project ID' });
    return getMemory(db, params.data.id);
  });
  app.post('/api/projects/:id/seed/preview', async (request, reply) => {
    const params = projectIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid project ID' });
    const [project] = await db.select().from(projects).where(eq(projects.id, params.data.id));
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    const [global] = await db.select().from(globalSettings).where(eq(globalSettings.key, 'instructions'));
    const result = await withProjectExecutionLock(db.$client, project.id, () =>
      client.complete({
        projectId: project.id,
        purpose: 'seed',
        model: settings.llmModel,
        maxTokens: 3000,
        timeoutMs: 90000,
        messages: [
          {
            role: 'system',
            content: `${global.value}\n\n${project.instructions}\n\nTransforme le document en propositions JSON {"proposals":[...]}. ${proposalInstructions}`,
          },
          { role: 'user', content: project.worldMd },
        ],
        schema: proposalsSchema,
      }),
    );
    return result;
  });
  app.post('/api/projects/:id/seed/apply', async (request, reply) => {
    const params = projectIdSchema.safeParse(request.params);
    const body = z
      .object({ proposals: z.array(z.unknown()).max(100) })
      .strict()
      .safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'Invalid request' });
    return db.transaction(async (tx) => {
      const project = await lockedProject(tx, params.data.id);
      await assertNoActiveTurn(tx, project.id);
      if (project.worldInitialized) throw new DomainError('World has already been initialized', 409);
      const branch = await ensureBranch(tx, project.id, project.activeBranchId);
      const result = await applyProposals(tx, {
        projectId: project.id,
        branchId: branch.branchId,
        state: branch.state,
        nextSeq: project.lastEventSeq,
        inputs: body.data.proposals,
        author: 'seed',
        evidence: project.worldMd,
      });
      if (result.results.some((item) => item.status === 'rejected')) {
        return { ...result, initialized: false };
      }
      await tx.update(projects).set({ worldInitialized: true }).where(eq(projects.id, project.id));
      return { ...result, initialized: true };
    });
  });
  app.post('/api/projects/:id/debug/proposals', async (request, reply) => {
    const params = projectIdSchema.safeParse(request.params);
    const body = z
      .object({
        proposals: z.array(z.unknown()).min(1).max(100),
        turnId: z.string().uuid().optional(),
      })
      .strict()
      .safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'Invalid request' });
    return debugProposals(db, params.data.id, body.data.proposals, body.data.turnId);
  });
}
