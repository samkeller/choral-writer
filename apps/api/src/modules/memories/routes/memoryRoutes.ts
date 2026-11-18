import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../../auth/routes.js';
import type { MemoryController } from '../controllers/memoryController.js';

export function registerMemoryRoutes(app: FastifyInstance, controller: MemoryController) {
  const base = '/api/projects/:projectId/branches/:branchId/memories';
  app.get(base, { preHandler: requireAuth }, (request) => controller.get(request));
  app.post(base, { preHandler: requireAuth }, (request) => controller.mutate(request));
  app.post(`${base}/setup`, { preHandler: requireAuth }, (request, reply) => controller.setup(request, reply));
  app.get('/api/projects/:projectId/turns/:turnId/memory', { preHandler: requireAuth }, (request) => controller.trace(request));
  app.post('/api/projects/:projectId/branches/:branchId/turns/:turnId/memory/retry',
    { preHandler: requireAuth }, (request, reply) => controller.retry(request, reply));
}
