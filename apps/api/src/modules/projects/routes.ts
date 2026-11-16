import type { FastifyInstance } from 'fastify';
import { projectInputSchema, projectParamsSchema } from '@choral-writer/shared';

import { requireAuth } from '../../auth/routes.js';
import type { ProjectsService } from './service.js';

export function registerProjectRoutes(app: FastifyInstance, service: ProjectsService): void {
  app.get('/api/projects', { preHandler: requireAuth }, () => service.list());

  app.post('/api/projects', { preHandler: requireAuth }, async (request, reply) => {
    const input = projectInputSchema.parse(request.body);
    return reply.code(201).send(await service.create(input));
  });

  app.get('/api/projects/:projectId', { preHandler: requireAuth }, (request) => {
    return service.get(projectParamsSchema.parse(request.params).projectId);
  });

  app.put('/api/projects/:projectId', { preHandler: requireAuth }, (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    return service.update(projectId, projectInputSchema.parse(request.body));
  });

  app.delete('/api/projects/:projectId', { preHandler: requireAuth }, async (request, reply) => {
    await service.remove(projectParamsSchema.parse(request.params).projectId);
    return reply.code(204).send();
  });
}
