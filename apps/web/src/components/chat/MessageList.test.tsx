// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { ChatTurn, Message, TurnMetrics } from '@choral-writer/shared';

import { initialPipelineProgress } from '../../hooks/chatPipelineProgress';
import { MessageList } from './MessageList';
import { PipelineFailure, PipelineProgress } from './PipelineProgress';

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
        turnMetrics={new Map()}
        inspectedTurnId={null}
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

function turn(id: string, user: Message, assistant: Message | null): ChatTurn {
  return {
    id, parentTurnId: null, originBranchId: 'branch', retryOfTurnId: null, regeneratedFromTurnId: null,
    status: assistant ? 'completed' : 'failed', error: assistant ? null : 'Échec.', userMessage: user, assistantMessage: assistant,
  };
}

describe('turn lines', () => {
  const firstTurnId = '019ad30c-19b0-7000-8000-000000000701';
  const failedTurnId = '019ad30c-19b0-7000-8000-000000000702';
  const retryInput: Message = { ...userMessage, id: 'user-2', content: 'Retry this.' };
  const metrics: TurnMetrics = {
    turnId: firstTurnId, durationMs: 12_400, cost: { microUsd: 4200, complete: true }, narratorInputTokens: 900,
    configurationChanges: [{ kind: 'systemPromptChanged' }],
  };

  it('puts a clickable line with duration, cost and configuration change under each turn', () => {
    const onInspectTurn = vi.fn();
    render(
      <MantineProvider env="test" forceColorScheme="dark">
        <MessageList messages={[userMessage, assistantMessage, retryInput]}
          turns={[turn(firstTurnId, userMessage, assistantMessage), turn(failedTurnId, retryInput, null)]}
          partial="" pending={false} pipelineProgress={null} turnMetrics={new Map([[firstTurnId, metrics]])}
          inspectedTurnId={null} onInspectTurn={onInspectTurn} />
      </MantineProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tour 1 : 12 s · 0,0042 $ · config modifiée' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tour 2 : échec · détail du tour' }));

    expect(onInspectTurn.mock.calls).toEqual([[firstTurnId], [failedTurnId]]);
  });
});

describe('PipelineProgress', () => {
  it('sums up the running turn in one line, without detail per agent', () => {
    const progress = initialPipelineProgress('turn');
    render(
      <MantineProvider env="test" forceColorScheme="dark">
        <PipelineProgress progress={{
          ...progress, activeStage: 'analysis', activeStageStartedAt: 0,
          analysis: {
            status: 'running', elapsedMs: 3200, agentCount: 2,
            agents: { a: { name: 'Agent A', status: 'completed', startedAt: 0, durationMs: 1000 },
              b: { name: 'Agent B', status: 'started', startedAt: 0, durationMs: null } },
          },
        }} />
      </MantineProvider>,
    );

    expect(screen.getByRole('status').textContent).toBe('Analyse · 1/2 agents · 3,2 s');
    expect(screen.queryByText('Agent A')).toBeNull();
  });

  it('turns red with a retry action when the turn failed', () => {
    const onRetry = vi.fn();
    render(
      <MantineProvider env="test" forceColorScheme="dark">
        <PipelineFailure error="Le fournisseur ne répond pas." disabled={false} onRetry={onRetry} />
      </MantineProvider>,
    );

    expect(screen.getByRole('alert').textContent).toContain('Échec du tour : Le fournisseur ne répond pas.');
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

