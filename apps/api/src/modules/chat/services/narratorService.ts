import type { createCallLLM } from '../../../llm/call-llm.js';
import { conversationMessages } from './conversationMessages.js';
import { NarratorStreamParser } from './narratorParser.js';
import type { NarratorInput } from '../types/narrator.types.js';

export class ChatNarratorService {
  constructor(private readonly callLLM: ReturnType<typeof createCallLLM>) {}

  async generate({
    turnId, agentId, agentVersionId, systemPrompt, whiteboard, history, userMessage, signal, onDelta,
  }: NarratorInput): Promise<string> {
    const parser = new NarratorStreamParser(onDelta);
    let narration: ReturnType<NarratorStreamParser['finish']> | undefined;
    await this.callLLM({
      turnId,
      agentId,
      agentVersionId,
      stage: 'narrator',
      signal,
      messages: conversationMessages([
        systemPrompt,
        'Use the validated analysis envelopes below as context. Return exactly one <resolution> section followed by one <prose> section, with no text outside those tags.',
        JSON.stringify(whiteboard),
      ].filter(Boolean).join('\n\n'), history, userMessage),
      onDelta: (delta) => parser.push(delta),
      validateResponse: (content) => { narration = parser.finish(content); },
    });
    if (!narration) throw new Error('Narrator response was not parsed.');
    return narration.prose;
  }
}
