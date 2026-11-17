import type { FastifyInstance } from 'fastify';
import {
  agentInputSchema, agentParamsSchema, projectAgentsInputSchema, projectParamsSchema, publishAgentVersionSchema,
  agentDtoSchema, projectAgentSchema,
} from '@choral-writer/shared';

import { parseResponseDto } from '../../../http/responseDto.js';
import { requireAuth } from '../../../auth/routes.js';
import type { AgentsService } from '../services/agentsService.js';
import { toAgentDto } from '../mappers/agentDto.js';

export function registerAgentRoutes(
  app: FastifyInstance,
  service: Pick<AgentsService, 'list' | 'create' | 'publish' | 'remove' | 'listForProject' | 'configure'>,
): void {
  app.get('/api/agents', { preHandler: requireAuth }, async () =>
    parseResponseDto(agentDtoSchema.array(), (await service.list()).map(toAgentDto)));
  app.post('/api/agents', { preHandler: requireAuth }, async (request, reply) => {
    const agent = await service.create(agentInputSchema.parse(request.body));
    return reply.code(201).send(parseResponseDto(agentDtoSchema, toAgentDto(agent)));
  });
  app.post('/api/agents/:agentId/versions', { preHandler: requireAuth }, async (request, reply) => {
    const { agentId } = agentParamsSchema.parse(request.params);
    const agent = await service.publish(agentId, publishAgentVersionSchema.parse(request.body));
    return reply.code(201).send(parseResponseDto(agentDtoSchema, toAgentDto(agent)));
  });
  app.delete('/api/agents/:agentId', { preHandler: requireAuth }, async (request, reply) => {
    await service.remove(agentParamsSchema.parse(request.params).agentId);
    return reply.code(204).send();
  });
  app.get('/api/projects/:projectId/agents', { preHandler: requireAuth }, async (request) => {
    const agents = await service.listForProject(projectParamsSchema.parse(request.params).projectId);
    return parseResponseDto(projectAgentSchema.array(), agents);
  });
  app.put('/api/projects/:projectId/agents', { preHandler: requireAuth }, async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const agents = await service.configure(projectId, projectAgentsInputSchema.parse(request.body));
    return parseResponseDto(projectAgentSchema.array(), agents);
  });
}
