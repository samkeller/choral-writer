import type { AnalysisEnvelope, ChatTurn, Message } from '@choral-writer/shared';

export type NarratorInput = {
  turnId: string;
  agentId: string;
  agentVersionId: string;
  systemPrompt: string;
  whiteboard: readonly AnalysisEnvelope[];
  history: readonly ChatTurn[];
  userMessage: Message;
  signal: AbortSignal;
  onDelta: (delta: string) => Promise<void>;
};

export type Narrator = (input: NarratorInput) => Promise<string>;
