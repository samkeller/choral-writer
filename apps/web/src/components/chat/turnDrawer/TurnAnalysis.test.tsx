// @vitest-environment jsdom

import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import type { TurnAttributionResponse, TurnTraceSummary } from '@choral-writer/shared';

import { api } from '../../../api/client';
import { TurnDrawer } from './TurnDrawer';

const projectId = '019ad30c-19b0-7000-8000-000000000801';
const turnA = '019ad30c-19b0-7000-8000-000000000802';
const turnB = '019ad30c-19b0-7000-8000-000000000806';
const analysisCallId = '019ad30c-19b0-7000-8000-000000000803';
const agentVersionId = '019ad30c-19b0-7000-8000-000000000804';
const originalAdapter = api.defaults.adapter;

const told = { kind: 'observation', text: 'Un fil est visible.', importance: 'HIGH' as const };
const dismissed = { kind: 'risque', text: 'Une chute possible.', importance: 'LOW' as const };
const offscreen = {
  kind: 'development' as const, characters: ['Personnage B'], scope: 'offscreen' as const,
  text: 'Un départ générique.', importance: 'NORMAL' as const,
};

function summary(turnId: string, directionFailed = false): TurnTraceSummary {
  return {
    turnId,
    analysis: [{
      agentId: null, agentVersionId, name: 'Chaos', status: 'success', durationMs: 400, attempts: 1,
      envelope: { v: 1, agent: 'Chaos', summary: 'Résumé.', items: [told, dismissed, offscreen] },
    }],
    direction: {
      agentId: null, agentVersionId: null, name: 'Directeur', status: directionFailed ? 'error' : 'success',
      durationMs: 200, attempts: 1, cost: { microUsd: 50, complete: true },
      direction: directionFailed ? null : {
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
      createdAt: '2025-01-01T00:00:00.000Z', error: null, costMicroUsd: 10, costBasis: 'priced', composition: null,
    }],
    timeline: [{ stage: 'narrator', durationMs: 900, agentCount: 1 }], durationMs: 900,
    cost: { microUsd: 1000, complete: true }, configuration: null,
  };
}

function reading(whatHappened: string, calls = 1): TurnAttributionResponse {
  return {
    attribution: {
      whatHappened,
      contributions: [{ agent: 'Chaos', item: told, verdict: 'partiel', note: 'dans la dernière phrase' }],
      callId: '019ad30c-19b0-7000-8000-000000000805',
      createdAt: '2025-01-01T00:00:00.000Z',
    },
    failure: null,
    cost: { microUsd: 1200, complete: true, calls },
  };
}

/** A failure of the model, cached by the server with the cost of what was tried. */
const failedReading: TurnAttributionResponse = {
  attribution: null,
  failure: { code: 'LLM_INVALID_RESPONSE', message: 'Réponse au format invalide.', failedAt: '2025-01-01T00:00:00.000Z' },
  cost: { microUsd: 900, complete: true, calls: 2 },
};

let summaries = new Map<string, TurnTraceSummary>();
/** What the next attribution requests of each turn answer, in order: a response, or a failed request. */
let answers = new Map<string, (TurnAttributionResponse | 'requestError')[]>();
/** Every attribution request sent, as `turn:regenerate`. */
let requests: string[] = [];

beforeEach(() => {
  summaries = new Map([[turnA, summary(turnA)], [turnB, summary(turnB)]]);
  answers = new Map();
  requests = [];
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  })));
  api.defaults.adapter = vi.fn<AxiosAdapter>(async (config: InternalAxiosRequestConfig) => {
    const ok = (data: unknown) => ({ config, status: 200, statusText: '200', headers: {}, data });
    const traced = config.url?.match(/turns\/([^/]+)\/traces$/)?.[1];
    if (traced && summaries.has(traced)) return ok(summaries.get(traced));
    const attributed = config.url?.match(/turns\/([^/]+)\/attribution$/)?.[1];
    if (config.method === 'post' && attributed) {
      const { regenerate } = JSON.parse(String(config.data)) as { regenerate: boolean };
      requests.push(`${attributed === turnA ? 'A' : 'B'}:${regenerate}`);
      const answer = answers.get(attributed)?.shift();
      if (answer === undefined) throw new Error(`Unexpected attribution request for ${attributed}.`);
      if (answer === 'requestError') {
        throw new AxiosError('Request failed', undefined, config, undefined, {
          config, status: 500, statusText: '', headers: {},
          data: { error: { code: 'INTERNAL_SERVER_ERROR', message: 'Erreur interne.', status: 500, source: 'application' } },
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

function Harness() {
  const [turnId, setTurnId] = useState(turnA);
  return (
    <MantineProvider env="test" forceColorScheme="dark">
      <TurnDrawer projectId={projectId} turnIds={[turnA, turnB]} metricsByTurn={new Map()} metricsError=""
        onRetryMetrics={vi.fn()} turnId={turnId} onSelectTurn={setTurnId} onClose={vi.fn()} />
    </MantineProvider>
  );
}

async function renderDrawer() {
  render(<Harness />);
  return within(await screen.findByRole('dialog'));
}

describe('turn attribution and analysis', () => {
  it('reads the prose at first opening and follows the items to it, in the Synthèse', async () => {
    answers.set(turnA, [reading('Le protagoniste remarque le fil.')]);
    const drawer = await renderDrawer();

    expect(await drawer.findByText('Le protagoniste remarque le fil.')).toBeTruthy();
    expect(requests).toEqual(['A:false']);
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

  it('regenerates only on a click: going to another turn and back never pays again', async () => {
    answers.set(turnA, [reading('Première lecture.'), reading('Seconde lecture.', 2), reading('Seconde lecture.', 2)]);
    answers.set(turnB, [reading('Lecture du tour B.')]);
    const drawer = await renderDrawer();
    await drawer.findByText('Première lecture.');

    fireEvent.click(drawer.getByRole('button', { name: 'Régénérer' }));
    expect(await drawer.findByText('Seconde lecture.')).toBeTruthy();
    expect(drawer.getByText(/\(2 appels\) · hors coût du tour/)).toBeTruthy();

    fireEvent.click(drawer.getByRole('button', { name: 'Tour suivant' }));
    await drawer.findByText('Lecture du tour B.');
    fireEvent.click(drawer.getByRole('button', { name: 'Tour précédent' }));
    await drawer.findByText('Seconde lecture.');

    expect(requests).toEqual(['A:false', 'A:true', 'B:false', 'A:false']);
  });

  it('reads nothing while the open tab does not show the attribution', async () => {
    answers.set(turnA, [reading('Lecture du tour A.')]);
    answers.set(turnB, [reading('Lecture du tour B.')]);
    const drawer = await renderDrawer();
    await drawer.findByText('Lecture du tour A.');

    fireEvent.click(drawer.getByRole('tab', { name: 'Coût et durée' }));
    fireEvent.click(drawer.getByRole('button', { name: 'Tour suivant' }));
    await drawer.findByRole('heading', { name: 'Tour 2 / 2' });
    await waitFor(() => expect(drawer.getAllByText('0,9 s').length).toBeGreaterThan(0));
    expect(requests).toEqual(['A:false']);

    fireEvent.click(drawer.getByRole('tab', { name: 'Analyse' }));
    await waitFor(() => expect(requests).toEqual(['A:false', 'B:false']));
  });

  it('shows a cached failure of the model with its cost, and pays again only on « Réessayer »', async () => {
    answers.set(turnA, [failedReading, reading('Après relance.', 3)]);
    const drawer = await renderDrawer();

    const alert = within(await drawer.findByRole('alert'));
    expect(alert.getByText('Réponse au format invalide.')).toBeTruthy();
    expect(drawer.getByText('Attribution : 0,0009 $ (2 appels) · hors coût du tour')).toBeTruthy();
    expect(drawer.getByRole('listitem', { name: '— visibles dans la prose : attribution en échec' })).toBeTruthy();

    fireEvent.click(alert.getByRole('button', { name: 'Réessayer' }));

    expect(await drawer.findByText('Après relance.')).toBeTruthy();
    expect(requests).toEqual(['A:false', 'A:true']);
  });

  it('repeats a failed request as it was', async () => {
    answers.set(turnA, ['requestError', reading('Après relance.')]);
    const drawer = await renderDrawer();

    const alert = within(await drawer.findByRole('alert'));
    expect(alert.getByText('Erreur interne.')).toBeTruthy();
    fireEvent.click(alert.getByRole('button', { name: 'Réessayer' }));

    expect(await drawer.findByText('Après relance.')).toBeTruthy();
    expect(requests).toEqual(['A:false', 'A:false']);
  });

  it('says the whiteboard went through as it was when the direction failed', async () => {
    summaries.set(turnA, summary(turnA, true));
    answers.set(turnA, [reading('Le protagoniste remarque le fil.')]);
    const drawer = await renderDrawer();
    await drawer.findByText('Le protagoniste remarque le fil.');

    const funnel = within(drawer.getByRole('list', { name: 'Entonnoir de l’analyse à la prose' }));
    expect(funnel.getByRole('listitem', { name: '3 transmis tels quels (direction en échec)' })).toBeTruthy();
  });

  it('gives each agent a card with the fate of its items, filtered, and a link to the raw response', async () => {
    answers.set(turnA, [reading('Le protagoniste remarque le fil.')]);
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
    fireEvent.click(drawer.getByRole('radio', { name: 'Développements' }));
    expect(items()).toEqual([expect.stringMatching(/Hors champ · Personnage B.*Un départ générique\./)]);

    fireEvent.click(card.getByRole('button', { name: 'Réponse brute →' }));
    expect(drawer.getByRole('tab', { name: 'Appels bruts' }).getAttribute('aria-selected')).toBe('true');
    expect(requests).toEqual(['A:false']);
  });
});
