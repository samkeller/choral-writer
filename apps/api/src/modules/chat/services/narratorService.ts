import type { createCallLLM } from '../../../llm/call-llm.js';
import { conversationMessages } from './conversationMessages.js';
import { narratorSystemPrompt } from './narratorPrompt.js';
import type { NarratorInput, NarratorOutput } from '../types/narrator.types.js';

export class ChatNarratorService {
  constructor(private readonly callLLM: ReturnType<typeof createCallLLM>) {}

  async generate({
    projectId, turnId, agentId, agentVersionId, systemPrompt, whiteboard, history, userMessage, signal, onDelta, memoryContext,
  }: NarratorInput): Promise<NarratorOutput> {
    const memory = memoryContext ?? { tags: [], entries: [] };
    const result = await this.callLLM({
      projectId,
      turnId,
      agentId,
      agentVersionId,
      stage: 'narrator',
      memory,
      signal,
      messages: conversationMessages(narratorSystemPrompt(systemPrompt, whiteboard, memory), history, userMessage),
      onDelta,
    });
    return { prose: result.content, callId: result.callId };
  }
}
