import type { FastifyRequest } from 'fastify';
import {
  chatBranchParamsSchema, chatExecutionParamsSchema, traceCallDetailSchema, traceCallParamsSchema,
  turnMetricsListSchema, turnTraceSummarySchema,
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

  async getBranchMetrics(request: FastifyRequest) {
    const { projectId, branchId } = chatBranchParamsSchema.parse(request.params);
    const metrics = await this.service.branchMetrics(projectId, branchId);
    return parseResponseDto(turnMetricsListSchema, metrics);
  }

  async getCallDetail(request: FastifyRequest) {
    const { projectId, turnId, callId } = traceCallParamsSchema.parse(request.params);
    const detail = await this.service.call(projectId, turnId, callId);
    return parseResponseDto(traceCallDetailSchema, detail);
  }
}
