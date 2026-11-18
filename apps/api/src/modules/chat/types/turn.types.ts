import type { ChatTurn, MemoryResult, MemoryState } from '@choral-writer/shared';

export type NewChatTurn = Pick<
  ChatTurn, 'parentTurnId' | 'userMessage' | 'retryOfTurnId' | 'regeneratedFromTurnId'
> & { branchId: string; memorySnapshot?: MemoryState };

export type TurnCompletion = { completedAt: Date; memoryResult?: MemoryResult } & (
  | { status: 'completed'; assistantMessageId: string }
  | { status: 'failed'; error: string }
);
