import type { createCallLLM } from '../../../llm/call-llm.js';
import type { NarratorInput } from '../types/narrator.types.js';

export class ChatNarratorService {
  constructor(private readonly callLLM: ReturnType<typeof createCallLLM>) {}

  async generate({ turnId, systemPrompt, history, userMessage, signal, onDelta }: NarratorInput): Promise<string> {
    const result = await this.callLLM({
      turnId,
      stage: 'narrator',
      signal,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history.flatMap((turn) => [turn.userMessage, ...(turn.assistantMessage ? [turn.assistantMessage] : [])])
          .map((message) => ({ role: message.role, content: message.content })),
        { role: 'user', content: userMessage.content },
      ],
      onDelta,
    });
    return result.content;
  }
}
