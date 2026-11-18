import type { ChatTurn, ChatTurnDto } from '@choral-writer/shared';

import { toMessageDto } from './messageDto.js';

export function toChatTurnDto(turn: ChatTurn): ChatTurnDto {
  return {
    id: turn.id,
    parentTurnId: turn.parentTurnId,
    originBranchId: turn.originBranchId,
    retryOfTurnId: turn.retryOfTurnId,
    regeneratedFromTurnId: turn.regeneratedFromTurnId,
    status: turn.status,
    error: turn.status === 'failed' ? 'La génération de ce tour a échoué.' : null,
    userMessage: toMessageDto(turn.userMessage),
    assistantMessage: turn.assistantMessage ? toMessageDto(turn.assistantMessage) : null,
    memory: turn.memory ?? null,
  };
}
