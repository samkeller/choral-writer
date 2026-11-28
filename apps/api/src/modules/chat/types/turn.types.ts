import type { ChatTurn, MemoryResult, MemoryState, TurnConfiguration } from '@choral-writer/shared';

export type NewChatTurn = Pick<
  ChatTurn, 'parentTurnId' | 'userMessage' | 'retryOfTurnId' | 'regeneratedFromTurnId'
> & { branchId: string; memorySnapshot?: MemoryState; configuration?: TurnConfiguration };

export type TurnCompletion = { completedAt: Date; memoryResult?: MemoryResult } & (
  | { status: 'completed'; assistantMessageId: string }
  | { status: 'failed'; error: string }
);
