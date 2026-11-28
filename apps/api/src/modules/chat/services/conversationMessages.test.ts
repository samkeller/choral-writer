import { describe, expect, it } from 'vitest';
import type { Message } from '@choral-writer/shared';

import { conversationMessages } from './conversationMessages.js';

function message(role: Message['role'], content: string): Message {
  return { id: `${role}-${content.length}`, projectId: 'project', role, content, createdAt: new Date() };
}

describe('conversationMessages', () => {
  it('measures the system sections, the history and the input of the request it builds', () => {
    const { messages, composition } = conversationMessages(
      [
        { part: 'systemPrompt', text: 'p'.repeat(40) },
        { part: 'instructions', text: '' },
        { part: 'rules', text: 'r'.repeat(12) },
      ],
      [
        { userMessage: message('user', 'u'.repeat(16)), assistantMessage: message('assistant', 'a'.repeat(64)) },
        { userMessage: message('user', 'v'.repeat(8)), assistantMessage: null },
      ],
      message('user', 'i'.repeat(4)),
    );

    expect(messages.map((entry) => entry.role)).toEqual(['system', 'user', 'assistant', 'user', 'user']);
    expect(messages[0]!.content).toBe(`${'p'.repeat(40)}\n\n${'r'.repeat(12)}`);
    expect(composition).toEqual([
      { part: 'systemPrompt', estimatedTokens: 10 },
      { part: 'rules', estimatedTokens: 3 },
      { part: 'history', estimatedTokens: 22 },
      { part: 'input', estimatedTokens: 1 },
    ]);
  });
});
