import type { FastifyRequest } from 'fastify';
import {
  chatExecutionParamsSchema, traceCallDetailSchema, traceCallParamsSchema, turnTraceSummarySchema,
} from '@choral-writer/shared';

import { parseResponseDto } from '../../../http/responseDto.js';
import type { TraceService } from '../services/traceService.js';

export class TraceController {
  constructor(private readonly service: TraceService) {}

  async getTurnSummary(request: FastifyRequest) {
    const { projectId, turnId } = chatExecutionParamsSchema.parse(request.params);
    const summary = await this.service.summary(projectId, turnId);
    return parseResponseDto(turnTraceSummarySchema, summary);
  }

  async getCallDetail(request: FastifyRequest) {
    const { projectId, turnId, callId } = traceCallParamsSchema.parse(request.params);
    const detail = await this.service.call(projectId, turnId, callId);
    return parseResponseDto(traceCallDetailSchema, detail);
  }
}
