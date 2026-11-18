import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  chatBranchParamsSchema, chatExecutionParamsSchema, chatTurnParamsSchema,
  memoryExpectedSchema, memoryMutationSchema, memoryResultSchema, memorySetupProposalSchema, memoryTraceSchema, memoryViewSchema,
} from '@choral-writer/shared';
import { parseResponseDto } from '../../../http/responseDto.js';
import type { MemoriesService } from '../services/memoriesService.js';
import type { ChatService } from '../../chat/services/chatService.js';

export class MemoryController {
  constructor(private readonly service: MemoriesService, private readonly chat: Pick<ChatService, 'turn' | 'retryMemory'>) {}

  async get(request: FastifyRequest) {
    const { projectId, branchId } = chatBranchParamsSchema.parse(request.params);
    return parseResponseDto(memoryViewSchema, await this.service.get(projectId, branchId));
  }
  async mutate(request: FastifyRequest) {
    const { projectId, branchId } = chatBranchParamsSchema.parse(request.params);
    return parseResponseDto(memoryViewSchema, await this.service.mutate(projectId, branchId, memoryMutationSchema.parse(request.body)));
  }
  async setup(request: FastifyRequest, reply: FastifyReply) {
    const { projectId, branchId } = chatBranchParamsSchema.parse(request.params);
    const expected = memoryExpectedSchema.parse(request.body);
    const controller = new AbortController();
    const abort = () => controller.abort();
    reply.raw.on('close', abort);
    try {
      return parseResponseDto(memorySetupProposalSchema, await this.service.proposeSetup(projectId, branchId,
        expected, AbortSignal.any([controller.signal, AbortSignal.timeout(300_000)])));
    } finally { reply.raw.off('close', abort); }
  }
  async trace(request: FastifyRequest) {
    const { projectId, turnId } = chatExecutionParamsSchema.parse(request.params);
    await this.chat.turn(projectId, turnId);
    const trace = await this.service.trace(projectId, turnId);
    return parseResponseDto(memoryTraceSchema, { ...trace,
      runs: trace.runs.map((run) => ({ ...run, createdAt: run.createdAt.toISOString() })),
    });
  }
  async retry(request: FastifyRequest, reply: FastifyReply) {
    const { projectId, branchId, turnId } = chatTurnParamsSchema.parse(request.params);
    const expected = memoryExpectedSchema.parse(request.body);
    const controller = new AbortController();
    const abort = () => controller.abort();
    reply.raw.on('close', abort);
    try {
      return parseResponseDto(memoryResultSchema, await this.chat.retryMemory(
        projectId, branchId, turnId, expected, AbortSignal.any([controller.signal, AbortSignal.timeout(300_000)]),
      ));
    } finally { reply.raw.off('close', abort); }
  }
}
