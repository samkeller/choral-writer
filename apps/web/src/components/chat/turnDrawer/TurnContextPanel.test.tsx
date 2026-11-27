// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { ContextComposition, TraceCallSummary, TurnMetrics } from '@choral-writer/shared';

import { TurnContextPanel } from './TurnContextPanel';

const turnIds = ['019ad30c-19b0-7000-8000-000000000701', '019ad30c-19b0-7000-8000-000000000702'];

const narratorComposition: ContextComposition = [
  { part: 'systemPrompt', estimatedTokens: 200 },
  { part: 'rules', estimatedTokens: 100 },
  { part: 'history', estimatedTokens: 600 },
  { part: 'input', estimatedTokens: 100 },
];

function call(overrides: Partial<TraceCallSummary>): TraceCallSummary {
  return {
    id: '019ad30c-19b0-7000-8000-000000000703', turnId: turnIds[1]!, stage: 'narrator', agentId: null,
    agentVersionId: null, agentName: null, agentVersion: null, model: 'test-model', status: 'success',
    inputTokens: 1100, outputTokens: 200, durationMs: 1000, createdAt: '2025-01-01T00:00:00.000Z', error: null,
    costMicroUsd: 1, costBasis: 'priced', composition: null, ...overrides,
  };
}

function metrics(turnId: string, overrides: Partial<TurnMetrics>): TurnMetrics {
  return {
    turnId, durationMs: 1000, cost: { microUsd: 1, complete: true }, narratorInputTokens: 500,
    narratorComposition: null, configurationChanges: null, direction: null, ...overrides,
  };
}

function renderPanel(calls: TraceCallSummary[], onSelectTurn = vi.fn()) {
  render(
    <MantineProvider env="test" forceColorScheme="dark">
      <TurnContextPanel calls={calls} index={1} onSelectTurn={onSelectTurn} metrics={[
        metrics(turnIds[0]!, {}),
        metrics(turnIds[1]!, { narratorInputTokens: 1100, narratorComposition }),
      ]} />
    </MantineProvider>,
  );
  return onSelectTurn;
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('TurnContextPanel', () => {
  it('splits each call into its parts and gives the share of the history in the Narrator input', () => {
    renderPanel([
      call({ id: '019ad30c-19b0-7000-8000-000000000704', stage: 'analysis', agentName: 'Agent A', inputTokens: 400,
        composition: [{ part: 'systemPrompt', estimatedTokens: 200 }, { part: 'memory', estimatedTokens: 200 }] }),
      call({ composition: narratorComposition }),
    ]);

    expect(screen.getByLabelText('Composition de l’entrée de Agent A')).toBeTruthy();
    expect(screen.getByLabelText('Composition de l’entrée de Narrateur')).toBeTruthy();
    expect(screen.getByText('historique : 60 % du Narrateur')).toBeTruthy();
    for (const label of ['Prompt du projet', 'Consignes fixes', 'Historique', 'Mémoire', 'Saisie']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.queryByText('Contributions')).toBeNull();
    expect(screen.queryByText('composition non enregistrée')).toBeNull();
  });

  it('keeps showing a call recorded before compositions, and says its composition is missing', () => {
    renderPanel([call({ composition: null })]);

    expect(screen.getByText('composition non enregistrée')).toBeTruthy();
    expect(screen.getByText(/k → 200$/)).toBeTruthy();
    expect(screen.queryByText(/historique :/)).toBeNull();
  });

  it('follows the history share over the story, and opens a turn from it', () => {
    const onSelectTurn = renderPanel([]);

    expect(screen.getByRole('button', { name: 'Tour 1 : 500 tokens (composition non enregistrée)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tour 1 : composition non enregistrée' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tour 2 : historique à 60 %' }));
    expect(onSelectTurn).toHaveBeenCalledWith(1);
  });
});
