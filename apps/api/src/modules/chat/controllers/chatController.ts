import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  chatBranchParamsSchema, chatExecutionParamsSchema, chatTurnParamsSchema,
  chatBranchDtoSchema, chatHistoryDtoSchema, chatTurnDtoSchema,
  headInputSchema, projectParamsSchema, regenerateInputSchema, sendMessageSchema,
} from '@choral-writer/shared';

import { parseResponseDto } from '../../../http/responseDto.js';
import type { ChatService } from '../services/chatService.js';
import { streamChatCommand } from './chatStream.js';
import { toChatBranchDto } from '../mappers/branchDto.js';
import { toChatHistoryDto } from '../mappers/historyDto.js';
import { toChatTurnDto } from '../mappers/turnDto.js';

export class ChatController {
  constructor(private readonly service: Pick<ChatService, 'branches' | 'history' | 'turn' | 'run'>) {}

  async getChatBranches(request: FastifyRequest) {
    const branches = await this.service.branches(projectParamsSchema.parse(request.params).projectId);
    return parseResponseDto(chatBranchDtoSchema.array(), branches.map(toChatBranchDto));
  }

  async getChatHistory(request: FastifyRequest) {
    const { projectId, branchId } = chatBranchParamsSchema.parse(request.params);
    const history = await this.service.history(projectId, branchId);
    return parseResponseDto(chatHistoryDtoSchema, toChatHistoryDto(history));
  }

  async getChatTurn(request: FastifyRequest) {
    const { projectId, turnId } = chatExecutionParamsSchema.parse(request.params);
    const turn = await this.service.turn(projectId, turnId);
    return parseResponseDto(chatTurnDtoSchema, toChatTurnDto(turn));
  }

  sendChat(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const params = chatBranchParamsSchema.parse(request.params);
    const input = sendMessageSchema.parse(request.body);
    return streamChatCommand(request, reply, (emit, signal) =>
      this.service.run({ ...params, ...input, operation: 'send' }, emit, signal));
  }

  regenerateChat(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const params = chatTurnParamsSchema.parse(request.params);
    const input = regenerateInputSchema.parse(request.body);
    return streamChatCommand(request, reply, (emit, signal) =>
      this.service.run({ ...params, ...input, operation: 'regenerate' }, emit, signal));
  }

  retryChat(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const params = chatTurnParamsSchema.parse(request.params);
    const input = headInputSchema.parse(request.body);
    return streamChatCommand(request, reply, (emit, signal) =>
      this.service.run({ ...params, ...input, operation: 'retry' }, emit, signal));
  }
}
