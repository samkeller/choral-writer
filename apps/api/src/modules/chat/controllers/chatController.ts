import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ChatHistory } from '@choral-writer/shared';
import {
  chatBranchParamsSchema, chatExecutionParamsSchema, chatTurnParamsSchema,
  headInputSchema, projectParamsSchema, sendMessageSchema,
} from '@choral-writer/shared';

import type { ChatService } from '../services/chatService.js';
import { streamChatCommand } from './chat.stream.js';

export class ChatController {
  constructor(private readonly service: ChatService) {}

  getChatBranches(request: FastifyRequest) {
    return this.service.branches(projectParamsSchema.parse(request.params).projectId);
  }

  getChatHistory(request: FastifyRequest): Promise<ChatHistory> {
    const { projectId, branchId } = chatBranchParamsSchema.parse(request.params);
    return this.service.history(projectId, branchId);
  }

  getChatTurn(request: FastifyRequest) {
    const { projectId, turnId } = chatExecutionParamsSchema.parse(request.params);
    return this.service.turn(projectId, turnId);
  }

  sendChat(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const params = chatBranchParamsSchema.parse(request.params);
    const input = sendMessageSchema.parse(request.body);
    return streamChatCommand(request, reply, (emit, signal) =>
      this.service.run({ ...params, ...input, operation: 'send' }, emit, signal));
  }

  repeatChat(operation: 'regenerate' | 'retry', request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const params = chatTurnParamsSchema.parse(request.params);
    const input = headInputSchema.parse(request.body);
    return streamChatCommand(request, reply, (emit, signal) =>
      this.service.run({ ...params, ...input, operation }, emit, signal));
  }
}
