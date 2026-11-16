import type { ChatTurn, Message } from '@choral-writer/shared';

export type NarratorInput = {
  turnId: string;
  systemPrompt: string;
  history: readonly ChatTurn[];
  userMessage: Message;
  signal: AbortSignal;
  onDelta: (delta: string) => Promise<void>;
};

export type Narrator = (input: NarratorInput) => Promise<string>;
