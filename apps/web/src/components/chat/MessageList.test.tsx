// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { Message } from '@choral-writer/shared';

import { MessageList } from './MessageList';

const userMessage: Message = {
  id: 'user-1', projectId: 'project', role: 'user', content: 'Continue the story.', createdAt: new Date(),
};

const assistantMessage: Message = {
  ...userMessage, id: 'assistant-1', role: 'assistant', content: 'A long story appears.',
};

function messageList(messages: Message[], partial: string) {
  return (
    <MantineProvider env="test" forceColorScheme="dark">
      <MessageList
        messages={messages}
        turns={[]}
        partial={partial}
        pending={Boolean(partial)}
        pipelineProgress={null}
        onInspectTurn={vi.fn()}
      />
    </MantineProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('MessageList scrolling', () => {
  it('does not follow a streamed or completed assistant response', () => {
    const messages = [userMessage];
    const view = render(messageList(messages, ''));
    const viewport = screen.getByRole('log') as HTMLElement;
    Object.defineProperty(viewport, 'scrollHeight', { configurable: true, value: 1000 });
    viewport.scrollTop = 120;

    view.rerender(messageList([...messages], '*A growing response.*'));
    expect(viewport.scrollTop).toBe(120);

    view.rerender(messageList([...messages, assistantMessage], ''));
    expect(viewport.scrollTop).toBe(120);
  });

  describe('MessageList Markdown', () => {
    it.each(['streaming', 'persisted'])('formats %s narration while keeping user input literal', (mode) => {
      const content = '*Elle est debout depuis un moment.*\n\n**La porte est ouverte.**';
      const messages = [{ ...userMessage, content }];
      if (mode === 'persisted') messages.push({ ...assistantMessage, content });

      render(messageList(messages, mode === 'streaming' ? content : ''));

      expect(screen.getByText('Elle est debout depuis un moment.').tagName).toBe('EM');
      expect(screen.getByText('La porte est ouverte.').tagName).toBe('STRONG');
      expect(screen.getByText(content, { normalizer: (text) => text }).tagName).toBe('P');
    });
  });

  it('scrolls to a newly submitted user message', () => {
    const view = render(messageList([], ''));
    const viewport = screen.getByRole('log') as HTMLElement;
    Object.defineProperty(viewport, 'scrollHeight', { configurable: true, value: 1000 });
    viewport.scrollTop = 120;

    view.rerender(messageList([userMessage], ''));

    expect(viewport.scrollTop).toBe(1000);
  });
});
