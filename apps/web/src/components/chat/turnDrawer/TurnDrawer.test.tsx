// @vitest-environment jsdom

import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import type { TurnMetrics, TurnTraceSummary } from '@choral-writer/shared';

import { api } from '../../../api/client';
import { TurnDrawer } from './TurnDrawer';
import styles from './TurnDrawer.module.css';

const projectId = '019ad30c-19b0-7000-8000-000000000601';
const firstTurnId = '019ad30c-19b0-7000-8000-000000000602';
const secondTurnId = '019ad30c-19b0-7000-8000-000000000603';
const originalAdapter = api.defaults.adapter;

function summary(turnId: string, microUsd: number, narratorMs: number): TurnTraceSummary {
  return {
    turnId, analysis: [], direction: null, developments: null, narrator: null, calls: [],
    timeline: [{ stage: 'narrator', durationMs: narratorMs, agentCount: 1 }], durationMs: narratorMs,
    cost: { microUsd, complete: true }, configuration: null,
  };
}

const metrics: TurnMetrics[] = [
  { turnId: firstTurnId, durationMs: 1000, cost: { microUsd: 1000, complete: true }, narratorInputTokens: 800, configurationChanges: null },
  {
    turnId: secondTurnId, durationMs: 4000, cost: { microUsd: 3000, complete: true }, narratorInputTokens: 2000,
    configurationChanges: [{ kind: 'agentChanged', name: 'Rythme', fromVersion: 1, toVersion: 2 }],
  },
];

const silentAgentCallId = '019ad30c-19b0-7000-8000-000000000604';
const silentAgent = { agentId: '019ad30c-19b0-7000-8000-000000000605', agentVersionId: '019ad30c-19b0-7000-8000-000000000606' };

const summaries = new Map([
  [firstTurnId, summary(firstTurnId, 1000, 1000)],
  [secondTurnId, {
    ...summary(secondTurnId, 3000, 4000),
    analysis: [{ ...silentAgent, name: 'Rythme', status: 'error' as const, durationMs: 300, attempts: 1, envelope: null }],
    direction: {
      agentId: null, agentVersionId: null, name: 'Directeur', status: 'success' as const, durationMs: 200, attempts: 1,
      cost: { microUsd: 50, complete: true },
      direction: {
        tension: 'monter' as const,
        nudges: [{ type: 'complication' as const, target: 'Personnage A', basis: null }],
        retained: [{ agent: 'Monde', item: {
          kind: 'development' as const, characters: [], scope: 'scene' as const, text: 'Un fait générique.', importance: 'NORMAL' as const,
        }, why: 'utile' }],
        dismissed: [],
      },
    },
    calls: [{
      id: silentAgentCallId, turnId: secondTurnId, stage: 'analysis', ...silentAgent, agentName: 'Rythme', agentVersion: 2,
      model: 'test-model', status: 'success' as const, inputTokens: 500, outputTokens: 20, durationMs: 300,
      createdAt: '2025-01-01T00:00:00.000Z', error: null, costMicroUsd: 1, costBasis: 'priced' as const,
    }],
  }],
]);

function Harness({ initialTurnId }: { initialTurnId: string }) {
  const [turnId, setTurnId] = useState(initialTurnId);
  return (
    <MantineProvider env="test" forceColorScheme="dark">
      <TurnDrawer projectId={projectId} turnIds={[firstTurnId, secondTurnId]}
        metricsByTurn={new Map(metrics.map((turn) => [turn.turnId, turn]))} metricsError=""
        onRetryMetrics={vi.fn()} turnId={turnId} onSelectTurn={setTurnId} onClose={vi.fn()} />
    </MantineProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  })));
  api.defaults.adapter = vi.fn<AxiosAdapter>(async (config: InternalAxiosRequestConfig) => {
    const turnId = config.url?.match(/turns\/([^/]+)\/traces$/)?.[1];
    const data = turnId ? summaries.get(turnId) : undefined;
    if (!data) throw new Error(`Unexpected request: ${config.url}`);
    return { config, status: 200, statusText: '200', headers: {}, data };
  });
});

afterEach(() => {
  cleanup();
  api.defaults.adapter = originalAdapter;
  vi.unstubAllGlobals();
});

describe('TurnDrawer', () => {
  it('styles the drawer content, not the wrapper that pins it to the right edge', async () => {
    render(<Harness initialTurnId={firstTurnId} />);
    const content = await screen.findByRole('dialog');
    const inner = content.parentElement!;

    expect(content.className).toContain(styles.drawer);
    expect(inner.className).toContain('mantine-Drawer-inner');
    expect(inner.className).not.toContain(styles.drawer);
  });

  it('flags an analysis agent the Narrator ran without and opens its raw call', async () => {
    render(<Harness initialTurnId={secondTurnId} />);
    const drawer = within(await screen.findByRole('dialog'));

    const point = (await drawer.findByText(/Rythme n’a produit aucune contribution valide/)).parentElement!;
    fireEvent.click(within(point).getByRole('button', { name: /Voir/ }));

    expect(drawer.getByRole('tab', { name: 'Appels bruts' }).getAttribute('aria-selected')).toBe('true');
    expect(await drawer.findByRole('button', { name: 'Retour aux appels' })).toBeTruthy();
  });

  it('points out what deserves a look and leads to the tab that details it', async () => {
    render(<Harness initialTurnId={secondTurnId} />);
    const drawer = within(await screen.findByRole('dialog'));

    await drawer.findByText(/Tour plus cher que la moyenne du récit/);
    expect(drawer.getByText(/L’entrée du Narrateur grossit : 2,0 k tokens contre 800/)).toBeTruthy();
    expect(drawer.getByText('Configuration modifiée depuis le tour précédent : Rythme v1 → v2.')).toBeTruthy();
    expect(within(drawer.getByRole('region', { name: 'Direction · Directeur' }))
      .getByText('Tension : monter · 1 nudge(s) · 1 retenu(s), 0 écarté(s)')).toBeTruthy();
    expect(drawer.getByRole('button', { name: /^Entrée du Narrateur : 2,0 k tokens, \+150 % vs tour précédent/ })).toBeTruthy();

    const configurationPoint = drawer.getByText(/Configuration modifiée/).parentElement!;
    fireEvent.click(within(configurationPoint).getByRole('button', { name: /Voir/ }));
    expect(drawer.getByRole('tab', { name: 'Configuration' }).getAttribute('aria-selected')).toBe('true');
    expect(drawer.getByText('Rythme v1 → v2')).toBeTruthy();
  });

  it('browses from turn to turn while keeping the open tab', async () => {
    render(<Harness initialTurnId={secondTurnId} />);
    const drawer = within(await screen.findByRole('dialog'));
    await drawer.findByRole('heading', { name: 'Tour 2 / 2' });
    expect(drawer.getByRole('button', { name: 'Tour suivant' }).hasAttribute('disabled')).toBe(true);

    fireEvent.click(drawer.getByRole('tab', { name: 'Coût et durée' }));
    expect((await drawer.findAllByText('4,0 s')).length).toBeGreaterThan(0);
    fireEvent.click(drawer.getByRole('button', { name: 'Tour précédent' }));

    await drawer.findByRole('heading', { name: 'Tour 1 / 2' });
    expect(drawer.getByRole('tab', { name: 'Coût et durée' }).getAttribute('aria-selected')).toBe('true');
    expect((await drawer.findAllByText('1,0 s')).length).toBeGreaterThan(0);
    expect(drawer.getByRole('button', { name: 'Tour précédent' }).hasAttribute('disabled')).toBe(true);
  });

  it('opens another turn from the story evolution', async () => {
    render(<Harness initialTurnId={secondTurnId} />);
    const drawer = within(await screen.findByRole('dialog'));

    fireEvent.click(drawer.getByRole('tab', { name: 'Récit' }));
    expect(drawer.getByText('Récit · 2 tour(s)')).toBeTruthy();
    fireEvent.click(drawer.getByRole('button', { name: 'Tour 1 : 0,0010 $' }));

    await drawer.findByRole('heading', { name: 'Tour 1 / 2' });
  });
});
