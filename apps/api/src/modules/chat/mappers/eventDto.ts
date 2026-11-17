import type { ChatEvent, ChatEventDto } from '@choral-writer/shared';

import { toMessageDto } from './messageDto.js';

export function toChatEventDto(event: ChatEvent): ChatEventDto {
  switch (event.type) {
    case 'chat.turn.started':
      return {
        type: event.type,
        turnId: event.turnId,
        branchId: event.branchId,
        operation: event.operation,
        message: toMessageDto(event.message),
      };
    case 'chat.turn.completed':
      return {
        type: event.type,
        turnId: event.turnId,
        branchId: event.branchId,
        message: toMessageDto(event.message),
      };
    case 'chat.message.delta':
      return { type: event.type, delta: event.delta };
    case 'chat.turn.failed':
      return {
        type: event.type,
        turnId: event.turnId,
        branchId: event.branchId,
        error: event.error,
      };
  }
}
