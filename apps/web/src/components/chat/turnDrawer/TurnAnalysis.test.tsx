// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import type { TurnAttributionResponse, TurnTraceSummary } from '@choral-writer/shared';

import { api } from '../../../api/client';
import { TurnDrawer } from './TurnDrawer';

const projectId = '019ad30c-19b0-7000-8000-000000000801';
const turnId = '019ad30c-19b0-7000-8000-000000000802';
const analysisCallId = '019ad30c-19b0-7000-8000-000000000803';
const agentVersionId = '019ad30c-19b0-7000-8000-000000000804';
const originalAdapter = api.defaults.adapter;

const told = { kind: 'observation', text: 'Un fil est visible.', importance: 'HIGH' as const };
const dismissed = { kind: 'risque', text: 'Une chute possible.', importance: 'LOW' as const };
const offscreen = {
  kind: 'development' as const, characters: ['Personnage B'], scope: 'offscreen' as const,
  text: 'Un départ générique.', importance: 'NORMAL' as const,
};

const summary: TurnTraceSummary = {
  turnId,
  analysis: [{
    agentId: null, agentVersionId, name: 'Chaos', status: 'success', durationMs: 400, attempts: 1,
    envelope: { v: 1, agent: 'Chaos', summary: 'Résumé.', items: [told, dismissed, offscreen] },
  }],
  direction: {
    agentId: null, agentVersionId: null, name: 'Directeur', status: 'success', durationMs: 200, attempts: 1,
    cost: { microUsd: 50, complete: true },
    direction: {
      tension: 'tenir', nudges: [],
      retained: [{ agent: 'Chaos', item: told, why: 'Concret.' }, { agent: 'Chaos', item: offscreen, why: 'Le monde avance.' }],
      dismissed: [{ agent: 'Chaos', item: dismissed, why: 'Hors sujet.' }],
    },
  },
  developments: null,
  narrator: { status: 'success', durationMs: 900, prose: 'Une prose fictive.' },
  calls: [{
    id: analysisCallId, turnId, stage: 'analysis', agentId: null, agentVersionId, agentName: 'Chaos', agentVersion: 1,
    model: 'test-model', status: 'success', inputTokens: 100, outputTokens: 20, durationMs: 400,
    createdAt: '2025-01-01T00:00:00.000Z', error: null, costMicroUsd: 10, costBasis: 'priced',
  }],
  timeline: [{ stage: 'narrator', durationMs: 900, agentCount: 1 }], durationMs: 900,
  cost: { microUsd: 1000, complete: true }, configuration: null,
};

function attribution(whatHappened: string, calls = 1): TurnAttributionResponse {
  return {
    attribution: {
      whatHappened,
      contributions: [{ agent: 'Chaos', item: told, verdict: 'partiel', note: 'dans la dernière phrase' }],
      callId: '019ad30c-19b0-7000-8000-000000000805',
      createdAt: '2025-01-01T00:00:00.000Z',
    },
    cost: { microUsd: 1200, complete: true, calls },
  };
}

/** What the next attribution requests answer, in order: a response, or a public error. */
let attributionAnswers: (TurnAttributionResponse | 'error')[] = [];
let attributionRequests: unknown[] = [];

beforeEach(() => {
  attributionAnswers = [];
  attributionRequests = [];
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  })));
  api.defaults.adapter = vi.fn<AxiosAdapter>(async (config: InternalAxiosRequestConfig) => {
    const ok = (data: unknown) => ({ config, status: 200, statusText: '200', headers: {}, data });
    if (config.url?.endsWith(`/turns/${turnId}/traces`)) return ok(summary);
    if (config.method === 'post' && config.url?.endsWith(`/turns/${turnId}/attribution`)) {
      attributionRequests.push(JSON.parse(String(config.data)));
      const answer = attributionAnswers.shift();
      if (answer === undefined) throw new Error('Unexpected attribution request.');
      if (answer === 'error') {
        throw new AxiosError('Request failed', undefined, config, undefined, {
          config, status: 502, statusText: '', headers: {},
          data: { error: { code: 'LLM_INVALID_RESPONSE', message: 'Réponse au format invalide.', status: 502, source: 'llm' } },
        });
      }
      return ok(answer);
    }
    throw new Error(`Unexpected request: ${config.url}`);
  });
});

afterEach(() => {
  cleanup();
  api.defaults.adapter = originalAdapter;
  vi.unstubAllGlobals();
});

function renderDrawer() {
  render(
    <MantineProvider env="test" forceColorScheme="dark">
      <TurnDrawer projectId={projectId} turnIds={[turnId]} metricsByTurn={new Map()} metricsError=""
        onRetryMetrics={vi.fn()} turnId={turnId} onSelectTurn={vi.fn()} onClose={vi.fn()} />
    </MantineProvider>,
  );
  return screen.findByRole('dialog').then((dialog) => within(dialog));
}

describe('turn attribution and analysis', () => {
  it('reads the prose at first opening and follows the items to it, in the Synthèse', async () => {
    attributionAnswers = [attribution('Le protagoniste remarque le fil.')];
    const drawer = await renderDrawer();

    expect(await drawer.findByText('Le protagoniste remarque le fil.')).toBeTruthy();
    expect(attributionRequests).toEqual([{ regenerate: false }]);
    const block = within(drawer.getByRole('region', { name: 'Ce qui s’est passé' }));
    const line = within(block.getByRole('listitem'));
    expect(line.getByText('proposait « Un fil est visible. »')).toBeTruthy();
    expect(line.getByText('partiel dans la prose')).toBeTruthy();
    expect(block.getByText(/Attribution : 0,0012 \$ · hors coût du tour/)).toBeTruthy();

    const funnel = within(drawer.getByRole('list', { name: 'Entonnoir de l’analyse à la prose' }));
    expect(funnel.getByRole('listitem', { name: '3 items produits par 1 agent(s)' })).toBeTruthy();
    expect(funnel.getByRole('listitem', { name: '2 transmis par le Directeur' })).toBeTruthy();
    expect(funnel.getByRole('listitem', { name: '1 visibles dans la prose, selon l’attribution' })).toBeTruthy();
    expect(funnel.getByRole('listitem', { name: '1 hors champ, connus du Gardien' })).toBeTruthy();
  });

  it('regenerates only on request', async () => {
    attributionAnswers = [attribution('Première lecture.'), attribution('Seconde lecture.', 2)];
    const drawer = await renderDrawer();
    await drawer.findByText('Première lecture.');

    fireEvent.click(drawer.getByRole('button', { name: 'Régénérer' }));

    expect(await drawer.findByText('Seconde lecture.')).toBeTruthy();
    expect(attributionRequests).toEqual([{ regenerate: false }, { regenerate: true }]);
    expect(drawer.getByText(/\(2 appels\) · hors coût du tour/)).toBeTruthy();
  });

  it('shows a failed attribution as such, says the funnel cannot tell, and retries', async () => {
    attributionAnswers = ['error', attribution('Après relance.')];
    const drawer = await renderDrawer();

    const alert = within(await drawer.findByRole('alert'));
    expect(alert.getByText('Réponse au format invalide.')).toBeTruthy();
    expect(drawer.getByRole('listitem', { name: '— visibles dans la prose : attribution en échec' })).toBeTruthy();

    fireEvent.click(alert.getByRole('button', { name: 'Réessayer' }));

    expect(await drawer.findByText('Après relance.')).toBeTruthy();
    expect(attributionRequests).toEqual([{ regenerate: false }, { regenerate: false }]);
  });

  it('gives each agent a card with the fate of its items, filtered, and a link to the raw response', async () => {
    attributionAnswers = [attribution('Le protagoniste remarque le fil.')];
    const drawer = await renderDrawer();
    await drawer.findByText('Le protagoniste remarque le fil.');

    fireEvent.click(drawer.getByRole('tab', { name: 'Analyse' }));
    const card = within(await drawer.findByRole('region', { name: 'Analyse · Chaos' }));
    expect(card.getByText(/3 item\(s\) · 2 transmis/)).toBeTruthy();
    const items = () => card.getAllByRole('listitem').map((item) => item.textContent);
    expect(items()).toEqual([
      expect.stringMatching(/Un fil est visible\.transmis · partiel dans la proseRetenu par le Directeur : Concret\. · Dans la prose : dans la dernière phrase/),
      expect.stringMatching(/Une chute possible\.écartéÉcarté par le Directeur : Hors sujet\./),
      expect.stringMatching(/Un départ générique\.transmis · hors champ, connu du Gardien/),
    ]);

    fireEvent.click(drawer.getByRole('radio', { name: 'Écartés' }));
    expect(items()).toEqual([expect.stringContaining('Une chute possible.')]);
    fireEvent.click(drawer.getByRole('radio', { name: 'Transmis' }));
    expect(items()).toHaveLength(2);

    fireEvent.click(card.getByRole('button', { name: 'Réponse brute →' }));
    expect(drawer.getByRole('tab', { name: 'Appels bruts' }).getAttribute('aria-selected')).toBe('true');
  });
});
