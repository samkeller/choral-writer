import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { ChatTurn, ContextComposition, Message } from '@choral-writer/shared';

import { joinSections, measureComposition, type ContextSection } from '../../../llm/contextComposition.js';

/**
 * A conversation request: the system sections joined into one system message, the story so far,
 * then the user's input. The composition measures each of them.
 */
export function conversationMessages(
  system: readonly ContextSection[],
  history: readonly Pick<ChatTurn, 'userMessage' | 'assistantMessage'>[],
  userMessage: Message,
): { messages: ChatCompletionMessageParam[]; composition: ContextComposition } {
  const historyMessages = history
    .flatMap((turn) => [turn.userMessage, ...(turn.assistantMessage ? [turn.assistantMessage] : [])])
    .map((message) => ({ role: message.role, content: message.content }));
  return {
    messages: [
      { role: 'system', content: joinSections(system) },
      ...historyMessages,
      { role: 'user', content: userMessage.content },
    ],
    composition: measureComposition([
      ...system,
      ...historyMessages.map((message) => ({ part: 'history' as const, text: message.content })),
      { part: 'input', text: userMessage.content },
    ]),
  };
}
