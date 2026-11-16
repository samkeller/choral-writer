import type { ChatCommand } from '@choral-writer/shared';

import { ApiError } from '../../../errors.js';
import type { ChatEntityServices } from '../types/chat.types.js';
import type { NewChatTurn } from '../types/turn.types.js';

export async function prepareTurn(services: ChatEntityServices, command: ChatCommand): Promise<NewChatTurn> {
  const branch = await services.branches.get(command.branchId);
  if (branch.headTurnId !== command.expectedHeadTurnId) {
    throw new ApiError(409, 'CHAT_HEAD_CHANGED', 'La conversation a changé. Rechargez-la avant de continuer.');
  }
  if (command.operation === 'send') {
    return {
      branchId: branch.id,
      parentTurnId: branch.headTurnId,
      userMessage: await services.messages.createUser(command.content),
      retryOfTurnId: null,
      regeneratedFromTurnId: null,
    };
  }
  if (command.turnId !== branch.headTurnId) {
    throw new ApiError(409, 'CHAT_NOT_HEAD', 'Seul le dernier tour de cette branche peut être relancé.');
  }
  const source = await services.turns.get(command.turnId);
  const expectedStatus = command.operation === 'retry' ? 'failed' : 'completed';
  if (source.status !== expectedStatus) {
    throw new ApiError(409, 'CHAT_INVALID_TURN_STATE', 'Cette action n\'est pas disponible pour ce tour.');
  }
  const input: NewChatTurn = {
    branchId: branch.id,
    parentTurnId: source.parentTurnId,
    userMessage: source.userMessage,
    retryOfTurnId: null,
    regeneratedFromTurnId: null,
  };
  if (command.operation === 'retry') return { ...input, retryOfTurnId: source.id };
  const alternative = await services.branches.fork(branch, source.parentTurnId);
  return { ...input, branchId: alternative.id, regeneratedFromTurnId: source.id };
}
