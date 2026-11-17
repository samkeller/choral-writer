import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { ChatTurn, Message } from '@choral-writer/shared';

export function conversationMessages(
  systemPrompt: string,
  history: readonly ChatTurn[],
  userMessage: Message,
): ChatCompletionMessageParam[] {
  return [
    { role: 'system', content: systemPrompt },
    ...history.flatMap((turn) => [turn.userMessage, ...(turn.assistantMessage ? [turn.assistantMessage] : [])])
      .map((message) => ({ role: message.role, content: message.content })),
    { role: 'user', content: userMessage.content },
  ];
}
