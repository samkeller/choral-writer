import type { createCallLLM } from '../../../llm/call-llm.js';
import { conversationMessages } from './conversationMessages.js';
import { NarratorStreamParser } from './narratorParser.js';
import type { NarratorInput, NarratorOutput } from '../types/narrator.types.js';
import { formatMemoryContext } from '../../memories/services/memoryState.js';

export class ChatNarratorService {
  constructor(private readonly callLLM: ReturnType<typeof createCallLLM>) {}

  async generate({
    projectId, turnId, agentId, agentVersionId, systemPrompt, whiteboard, history, userMessage, signal, onDelta, memoryContext,
  }: NarratorInput): Promise<NarratorOutput> {
    const parser = new NarratorStreamParser(onDelta);
    const memory = memoryContext ?? { tags: [], entries: [] };
    let narration: ReturnType<NarratorStreamParser['finish']> | undefined;
    const result = await this.callLLM({
      projectId,
      turnId,
      agentId,
      agentVersionId,
      stage: 'narrator',
      memory,
      signal,
      messages: conversationMessages([
        systemPrompt,
        'Use the validated analysis envelopes below as context. Return exactly one <resolution> section followed by one <prose> section, with no text outside those tags.',
        JSON.stringify(whiteboard),
        formatMemoryContext(memory),
      ].filter(Boolean).join('\n\n'), history, userMessage),
      onDelta: (delta) => parser.push(delta),
      validateResponse: (content) => { narration = parser.finish(content); },
    });
    if (!narration) throw new Error('Narrator response was not parsed.');
    return { ...narration, callId: result.callId };
  }
}
