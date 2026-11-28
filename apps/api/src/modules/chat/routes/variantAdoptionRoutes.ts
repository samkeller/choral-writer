import type { FastifyInstance } from 'fastify';
import { chatExecutionParamsSchema, projectDtoSchema } from '@choral-writer/shared';

import { requireAuth } from '../../../auth/routes.js';
import { parseResponseDto } from '../../../http/responseDto.js';
import { toProjectDto } from '../../projects/mappers/projectDto.js';
import type { VariantAdoptionService } from '../services/variantAdoptionService.js';

/** Answers with the project as the adoption left it: its prompt and its story branch. */
export function registerVariantAdoptionRoutes(
  app: FastifyInstance, service: Pick<VariantAdoptionService, 'adopt'>,
): void {
  app.post('/api/projects/:projectId/turns/:turnId/adoption', { preHandler: requireAuth }, async (request) => {
    const { projectId, turnId } = chatExecutionParamsSchema.parse(request.params);
    return parseResponseDto(projectDtoSchema, toProjectDto(await service.adopt(projectId, turnId)));
  });
}
