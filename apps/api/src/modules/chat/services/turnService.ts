import type { ChatTurn, TurnConfiguration } from '@choral-writer/shared';

import { ApiError } from '../../../errors/errors.js';
import type { ChatTurnRepository } from '../repositories/turnRepository.js';
import type { ChatRunResult } from '../types/chat.types.js';
import type { NewChatTurn, TurnCompletion } from '../types/turn.types.js';

const turnNotFound = () => new ApiError(404, 'CHAT_TURN_NOT_FOUND', 'Ce tour n\'existe pas dans ce projet.');

export class ChatTurnService {
  constructor(private readonly repository: ChatTurnRepository) {}

  /** Also resolves archived retries that are no longer in the branch's current path. */
  async get(id: string): Promise<ChatTurn> {
    const turn = await this.repository.find(id);
    if (!turn) throw turnNotFound();
    return turn;
  }

  async path(headTurnId: string | null, limit?: number): Promise<ChatTurn[]> {
    const turns = await this.repository.path(headTurnId, limit);
    if (!turns) throw turnNotFound();
    return turns;
  }

  async configuration(id: string): Promise<TurnConfiguration | null> {
    const configuration = await this.repository.configuration(id);
    if (configuration === undefined) throw turnNotFound();
    return configuration;
  }

  start(input: NewChatTurn): Promise<string> {
    return this.repository.create(input);
  }

  /** Only a running execution can become terminal; results are never overwritten. */
  async finish(id: string, branchId: string, result: ChatRunResult, completedAt: Date): Promise<void> {
    const completion: TurnCompletion = result.status === 'completed'
      ? { status: 'completed', assistantMessageId: result.message.id, completedAt, memoryResult: result.memory }
      : {
        status: 'failed', completedAt,
        error: result.error instanceof Error ? result.error.message : String(result.error),
      };
    if (!await this.repository.finish(id, branchId, completion)) {
      throw new Error('Cannot finish a missing or terminal chat turn, or one from another branch.');
    }
  }
}
