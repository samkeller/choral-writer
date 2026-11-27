import type { FastifyInstance } from 'fastify';
import {
  projectDefaultBranchInputSchema, projectDtoSchema, projectInputSchema, projectParamsSchema,
} from '@choral-writer/shared';

import { parseResponseDto } from '../../../http/responseDto.js';
import { requireAuth } from '../../../auth/routes.js';
import type { ProjectsService } from '../services/projectServices.js';
import { toProjectDto } from '../mappers/projectDto.js';

export function registerProjectRoutes(
  app: FastifyInstance,
  service: Pick<ProjectsService, 'list' | 'create' | 'get' | 'update' | 'setDefaultBranch' | 'remove'>,
): void {
  app.get('/api/projects', { preHandler: requireAuth }, async () =>
    parseResponseDto(projectDtoSchema.array(), (await service.list()).map(toProjectDto)));

  app.post('/api/projects', { preHandler: requireAuth }, async (request, reply) => {
    const input = projectInputSchema.parse(request.body);
    const project = await service.create(input);
    return reply.code(201).send(parseResponseDto(projectDtoSchema, toProjectDto(project)));
  });

  app.get('/api/projects/:projectId', { preHandler: requireAuth }, async (request) => {
    const project = await service.get(projectParamsSchema.parse(request.params).projectId);
    return parseResponseDto(projectDtoSchema, toProjectDto(project));
  });

  app.put('/api/projects/:projectId', { preHandler: requireAuth }, async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const project = await service.update(projectId, projectInputSchema.parse(request.body));
    return parseResponseDto(projectDtoSchema, toProjectDto(project));
  });

  app.put('/api/projects/:projectId/default-branch', { preHandler: requireAuth }, async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const { branchId } = projectDefaultBranchInputSchema.parse(request.body);
    return parseResponseDto(projectDtoSchema, toProjectDto(await service.setDefaultBranch(projectId, branchId)));
  });

  app.delete('/api/projects/:projectId', { preHandler: requireAuth }, async (request, reply) => {
    await service.remove(projectParamsSchema.parse(request.params).projectId);
    return reply.code(204).send();
  });
}
