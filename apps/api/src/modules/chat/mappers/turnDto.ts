import type { ChatTurn } from '@choral-writer/shared';

import { messageDto } from './messageDto.js';
import type { TurnRow } from '../types/turn-row.types.js';

export function turnDto({ turn, user, assistant }: TurnRow): ChatTurn {
  if (turn.assistantMessageId && !assistant) throw new Error('Missing chat assistant message.');
  return {
    id: turn.id,
    parentTurnId: turn.parentTurnId,
    originBranchId: turn.originBranchId,
    retryOfTurnId: turn.retryOfTurnId,
    regeneratedFromTurnId: turn.regeneratedFromTurnId,
    status: turn.status,
    error: turn.status === 'failed' ? 'La génération de ce tour a échoué.' : null,
    userMessage: messageDto(user),
    assistantMessage: assistant ? messageDto(assistant) : null,
  };
}
