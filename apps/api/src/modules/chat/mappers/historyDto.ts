import type { ChatHistory, ChatHistoryDto } from '@choral-writer/shared';

import { toChatBranchDto } from './branchDto.js';
import { toChatTurnDto } from './turnDto.js';

export function toChatHistoryDto(history: ChatHistory): ChatHistoryDto {
  return {
    branch: toChatBranchDto(history.branch),
    turns: history.turns.map(toChatTurnDto),
  };
}
