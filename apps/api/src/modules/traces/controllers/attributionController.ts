import type { FastifyRequest } from 'fastify';
import {
  chatExecutionParamsSchema, turnAttributionRequestSchema, turnAttributionResponseSchema,
} from '@choral-writer/shared';

import { parseResponseDto } from '../../../http/responseDto.js';
import type { AttributionService } from '../services/attributionService.js';

export class AttributionController {
  constructor(private readonly service: AttributionService) {}

  async attributeTurn(request: FastifyRequest) {
    const { projectId, turnId } = chatExecutionParamsSchema.parse(request.params);
    const { regenerate } = turnAttributionRequestSchema.parse(request.body ?? {});
    const response = await this.service.forTurn(projectId, turnId, { regenerate });
    return parseResponseDto(turnAttributionResponseSchema, response);
  }
}
