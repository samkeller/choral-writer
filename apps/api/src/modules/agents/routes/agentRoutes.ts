import type { FastifyInstance } from 'fastify';
import {
  agentInputSchema, agentParamsSchema, projectAgentsInputSchema, projectParamsSchema, publishAgentVersionSchema,
} from '@choral-writer/shared';

import { requireAuth } from '../../../auth/routes.js';
import type { AgentsService } from '../services/agentsService.js';

export function registerAgentRoutes(app: FastifyInstance, service: AgentsService): void {
  app.get('/api/agents', { preHandler: requireAuth }, () => service.list());
  app.post('/api/agents', { preHandler: requireAuth }, async (request, reply) =>
    reply.code(201).send(await service.create(agentInputSchema.parse(request.body))));
  app.post('/api/agents/:agentId/versions', { preHandler: requireAuth }, async (request, reply) => {
    const { agentId } = agentParamsSchema.parse(request.params);
    return reply.code(201).send(await service.publish(agentId, publishAgentVersionSchema.parse(request.body)));
  });
  app.delete('/api/agents/:agentId', { preHandler: requireAuth }, async (request, reply) => {
    await service.remove(agentParamsSchema.parse(request.params).agentId);
    return reply.code(204).send();
  });
  app.get('/api/projects/:projectId/agents', { preHandler: requireAuth }, (request) =>
    service.listForProject(projectParamsSchema.parse(request.params).projectId));
  app.put('/api/projects/:projectId/agents', { preHandler: requireAuth }, (request) =>
    service.configure(projectParamsSchema.parse(request.params).projectId, projectAgentsInputSchema.parse(request.body)));
}
