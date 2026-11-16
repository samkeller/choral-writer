import type { ChatTurn } from '@choral-writer/shared';

export type NewChatTurn = Pick<
  ChatTurn, 'parentTurnId' | 'userMessage' | 'retryOfTurnId' | 'regeneratedFromTurnId'
> & { branchId: string };

export type TurnCompletion = { completedAt: Date } & (
  | { status: 'completed'; assistantMessageId: string }
  | { status: 'failed'; error: string }
);
