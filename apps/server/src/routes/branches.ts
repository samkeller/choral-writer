import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { branches } from '../schema.js';
import { rewind, switchBranch } from '../memory.js';
import type { RouteDependencies } from './types.js';
import { projectIdSchema } from './types.js';

export function registerBranchRoutes(app: FastifyInstance, { db }: RouteDependencies) {
  app.get('/api/projects/:id/branches', async (request, reply) => {
    const params = projectIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid project ID' });
    return db
      .select()
      .from(branches)
      .where(eq(branches.projectId, params.data.id))
      .orderBy(branches.createdAt);
  });
  app.post('/api/projects/:id/rewind', async (request, reply) => {
    const params = projectIdSchema.safeParse(request.params);
    const body = z.object({ turnId: z.string().uuid() }).strict().safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'Invalid request' });
    return rewind(db, params.data.id, body.data.turnId);
  });
  app.post('/api/projects/:id/branches/:branchId/activate', async (request, reply) => {
    const params = z.object({ id: z.string().uuid(), branchId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid request' });
    return switchBranch(db, params.data.id, params.data.branchId);
  });
}
