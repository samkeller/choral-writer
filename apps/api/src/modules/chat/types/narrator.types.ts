import type { AnalysisEnvelope, ChatTurn, MemoryContext, Message, TurnDirection } from '@choral-writer/shared';

export type NarratorInput = {
  projectId: string;
  turnId: string;
  agentId: string;
  agentVersionId: string;
  systemPrompt: string;
  whiteboard: readonly AnalysisEnvelope[];
  /** When present, replaces the whiteboard in the Narrator's prompt. */
  direction: TurnDirection | null;
  history: readonly ChatTurn[];
  userMessage: Message;
  signal: AbortSignal;
  onDelta: (delta: string) => Promise<void>;
  memoryContext?: MemoryContext;
};

export type NarratorOutput = { prose: string; callId: string };
export type Narrator = (input: NarratorInput) => Promise<NarratorOutput>;
