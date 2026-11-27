// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import type {
  ProjectDto, TurnAttributionResponse, TurnConfiguration, TurnTraceSummary,
} from '@choral-writer/shared';

import { api } from '../../../api/client';
import { VariantComparisonDrawer } from './VariantComparisonDrawer';

const projectId = '019ad30c-19b0-7000-8000-000000000701';
const originalTurnId = '019ad30c-19b0-7000-8000-000000000702';
const variantTurnId = '019ad30c-19b0-7000-8000-000000000703';
const variantBranchId = '019ad30c-19b0-7000-8000-000000000704';
const originalAdapter = api.defaults.adapter;

const agent = (n: number, name: string, version: number): TurnConfiguration['agents'][number] => ({
  agentId: `019ad30c-19b0-7000-8000-00000000080${n}`, versionId: `019ad30c-19b0-7000-8000-0000000009${n}${version}`, name, version,
  phase: 'analysis', output: 'envelope', memoryRead: null,
});

function summary(turnId: string, configuration: TurnConfiguration, prose: string, microUsd: number): TurnTraceSummary {
  return {
    turnId, analysis: [], direction: null, developments: null, calls: [], timeline: [],
    narrator: { status: 'success', durationMs: 2000, prose },
    durationMs: 2000, cost: { microUsd, complete: true }, configuration,
  };
}

const summaries = new Map([
  [originalTurnId, summary(originalTurnId, { systemPrompt: 'Prompt A', agents: [agent(1, 'Chaos', 1)] },
    'Une prose d’origine en six mots.', 1000)],
  [variantTurnId, summary(variantTurnId, { systemPrompt: 'Prompt A', agents: [agent(1, 'Chaos', 2), agent(2, 'Monde', 1)] },
    'Une variante plus courte.', 2000)],
]);

function attribution(whatHappened: string, verdicts: ('retenu' | 'absent')[]): TurnAttributionResponse {
  return {
    attribution: {
      whatHappened, callId: '019ad30c-19b0-7000-8000-000000000799', createdAt: '2025-01-01T00:00:00.000Z',
      contributions: verdicts.map((verdict, index) => ({
        agent: index === 0 ? 'Chaos' : 'Monde', verdict, note: '',
        item: { kind: 'suggestion', text: 'Une idée générique.', importance: 'NORMAL' },
      })),
    },
    failure: null,
    cost: { microUsd: 10, complete: true, calls: 1 },
  };
}

const attributions = new Map([
  [originalTurnId, attribution('Résumé générique de l’origine.', ['absent'])],
  [variantTurnId, attribution('Résumé générique de la variante.', ['retenu', 'absent'])],
]);

const adoptedProject: ProjectDto = {
  id: projectId, name: 'Projet', systemPrompt: 'Prompt A', defaultBranchId: variantBranchId,
  createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
};

let requests: InternalAxiosRequestConfig[];

function renderDrawer() {
  const handlers = { onAdopted: vi.fn(), onKeepOriginal: vi.fn(), onClose: vi.fn() };
  render(
    <MantineProvider env="test" forceColorScheme="dark">
      <VariantComparisonDrawer projectId={projectId} originalTurnId={originalTurnId} variantTurnId={variantTurnId} {...handlers} />
    </MantineProvider>,
  );
  return handlers;
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  })));
  requests = [];
  api.defaults.adapter = vi.fn<AxiosAdapter>(async (config: InternalAxiosRequestConfig) => {
    requests.push(config);
    const [, turnId, resource] = config.url?.match(/turns\/([^/]+)\/(traces|attribution|adoption)$/) ?? [];
    const data = resource === 'traces' ? summaries.get(turnId!)
      : resource === 'attribution' ? attributions.get(turnId!)
        : resource === 'adoption' && turnId === variantTurnId ? adoptedProject : undefined;
    if (!data) throw new Error(`Unexpected request: ${config.url}`);
    return { config, status: 200, statusText: '200', headers: {}, data };
  });
});

afterEach(() => {
  cleanup();
  api.defaults.adapter = originalAdapter;
  vi.unstubAllGlobals();
});

const requestsTo = (resource: string) => requests.filter((request) => request.url?.endsWith(`/${resource}`));

describe('VariantComparisonDrawer', () => {
  it('shows both versions side by side, each prose under its configuration, reading, verdicts and measures', async () => {
    renderDrawer();
    const drawer = within(await screen.findByRole('dialog'));
    const original = within(drawer.getByRole('region', { name: 'Version d’origine' }));
    const variant = within(drawer.getByRole('region', { name: 'Variante' }));

    expect(await original.findByText('Une prose d’origine en six mots.')).toBeTruthy();
    expect(await variant.findByText('Une variante plus courte.')).toBeTruthy();

    const badges = (column: typeof original) => within(column.getByRole('list', { name: 'Configuration' }))
      .getAllByRole('listitem').map((badge) => [badge.textContent, badge.getAttribute('data-change')]);
    expect(badges(original)).toEqual([['Chaos v1', 'changed'], ['Prompt du projet', 'same']]);
    expect(badges(variant)).toEqual([['Chaos v2', 'changed'], ['Monde v1', 'added'], ['Prompt du projet', 'same']]);

    expect(await original.findByText('Résumé générique de l’origine.')).toBeTruthy();
    expect(await variant.findByText('Résumé générique de la variante.')).toBeTruthy();
    expect(within(variant.getByRole('list', { name: 'Verdicts par agent' })).getAllByRole('listitem')
      .map((badge) => badge.textContent)).toEqual(['Chaos : retenu', 'Monde : absent']);

    expect(original.getByText('0,0010 $ · 2,0 s · 6 mots')).toBeTruthy();
    expect(variant.getByText('0,0020 $ · 2,0 s · 4 mots')).toBeTruthy();
    // Opening the view reads the cached attribution of each turn once, never asking for a recomputation.
    expect(requestsTo('attribution').map((request) => [request.url, JSON.parse(String(request.data))])).toEqual([
      [`/projects/${projectId}/turns/${originalTurnId}/attribution`, { regenerate: false }],
      [`/projects/${projectId}/turns/${variantTurnId}/attribution`, { regenerate: false }],
    ]);
  });

  it('adopts the variant through the API and hands back the project it left', async () => {
    const { onAdopted, onKeepOriginal } = renderDrawer();
    const drawer = within(await screen.findByRole('dialog'));

    fireEvent.click(drawer.getByRole('button', { name: 'Adopter la variante' }));

    await waitFor(() => expect(onAdopted).toHaveBeenCalledTimes(1));
    expect(onAdopted.mock.calls[0]![0]).toMatchObject({ id: projectId, defaultBranchId: variantBranchId });
    expect(requestsTo('adoption').map((request) => [request.method, request.url]))
      .toEqual([['post', `/projects/${projectId}/turns/${variantTurnId}/adoption`]]);
    expect(onKeepOriginal).not.toHaveBeenCalled();
  });

  it('keeps the original without any request that could change the project', async () => {
    const { onAdopted, onKeepOriginal } = renderDrawer();
    const drawer = within(await screen.findByRole('dialog'));
    await drawer.findByText('Résumé générique de la variante.');

    fireEvent.click(drawer.getByRole('button', { name: 'Garder l’original' }));

    expect(onKeepOriginal).toHaveBeenCalledTimes(1);
    expect(onAdopted).not.toHaveBeenCalled();
    expect(requests.filter((request) => !/\/(traces|attribution)$/.test(request.url ?? ''))).toEqual([]);
  });

  it('says why an adoption failed and stays open', async () => {
    api.defaults.adapter = vi.fn<AxiosAdapter>(async (config) => {
      if (config.url?.endsWith('/adoption')) throw new Error('Adoption refusée.');
      const turnId = config.url?.match(/turns\/([^/]+)\//)?.[1];
      const data = config.url?.endsWith('/traces') ? summaries.get(turnId!) : attributions.get(turnId!);
      return { config, status: 200, statusText: '200', headers: {}, data };
    });
    const { onAdopted } = renderDrawer();
    const drawer = within(await screen.findByRole('dialog'));

    fireEvent.click(drawer.getByRole('button', { name: 'Adopter la variante' }));

    expect(await drawer.findByRole('alert')).toBeTruthy();
    expect(onAdopted).not.toHaveBeenCalled();
  });
});
