import { describe, expect, it } from 'vitest';
import type { TurnAttribution, TurnDirection, TurnTraceSummary } from '@choral-writer/shared';

import { analysisCards, analysisFunnel, matchesFilter } from './analysisInsights';

const told = { kind: 'observation', text: 'Un fil est visible.', importance: 'HIGH' as const };
const ignored = { kind: 'idee', text: 'Une porte grince.', importance: 'LOW' as const };
const dismissed = { kind: 'risque', text: 'Une chute possible.', importance: 'LOW' as const };
const offscreen = {
  kind: 'development' as const, characters: ['Personnage B'], scope: 'offscreen' as const,
  text: 'Un départ générique.', importance: 'NORMAL' as const,
};

function summary(direction: TurnDirection | null): TurnTraceSummary {
  return {
    turnId: '019ad30c-19b0-7000-8000-000000000701',
    analysis: [{
      agentId: null, agentVersionId: '019ad30c-19b0-7000-8000-000000000702', name: 'Chaos', status: 'success',
      durationMs: 1, attempts: 1, envelope: { v: 1, agent: 'Chaos', summary: 'Résumé.', items: [told, ignored, dismissed, offscreen] },
    }],
    direction: direction && {
      agentId: null, agentVersionId: null, name: 'Directeur', status: 'success', durationMs: 1, attempts: 1,
      cost: { microUsd: 0, complete: true }, direction,
    },
    developments: null, narrator: null, calls: [], timeline: [], durationMs: 0,
    cost: { microUsd: 0, complete: true }, configuration: null,
  };
}

const direction: TurnDirection = {
  tension: 'tenir', nudges: [],
  retained: [
    { agent: 'Chaos', item: told, why: 'Concret.' }, { agent: 'Chaos', item: ignored, why: 'Ambiance.' },
    { agent: 'Chaos', item: offscreen, why: 'Le monde avance.' },
  ],
  dismissed: [{ agent: 'Chaos', item: dismissed, why: 'Hors sujet.' }],
};

const attribution: TurnAttribution = {
  whatHappened: 'Le protagoniste remarque le fil.',
  contributions: [
    { agent: 'Chaos', item: told, verdict: 'partiel', note: 'à la fin' },
    { agent: 'Chaos', item: ignored, verdict: 'absent', note: '' },
  ],
  callId: '019ad30c-19b0-7000-8000-000000000703',
  createdAt: '2025-01-01T00:00:00.000Z',
};

describe('analysisCards', () => {
  it('follows each item from the Director’s sorting to the prose', () => {
    const [card] = analysisCards(summary(direction), attribution);

    expect(card?.items.map(({ fate }) => fate)).toEqual([
      { kind: 'told', why: 'Concret.', reading: { verdict: 'partiel', note: 'à la fin' } },
      { kind: 'told', why: 'Ambiance.', reading: { verdict: 'absent', note: '' } },
      { kind: 'dismissed', why: 'Hors sujet.' },
      { kind: 'offscreen', why: 'Le monde avance.' },
    ]);
  });

  it('transmits every item without a direction, and reads nothing while the attribution is unavailable', () => {
    const [card] = analysisCards(summary(null), null);

    expect(card?.items.map(({ fate }) => fate.kind)).toEqual(['told', 'told', 'told', 'offscreen']);
    expect(card?.items[0]?.fate).toEqual({ kind: 'told', why: null, reading: null });
  });

  it('filters transmitted and dismissed items', () => {
    const fates = analysisCards(summary(direction), null)[0]!.items.map(({ fate }) => fate);

    expect(fates.filter((fate) => matchesFilter(fate, 'transmitted'))).toHaveLength(3);
    expect(fates.filter((fate) => matchesFilter(fate, 'dismissed'))).toEqual([{ kind: 'dismissed', why: 'Hors sujet.' }]);
    expect(fates.filter((fate) => matchesFilter(fate, 'all'))).toHaveLength(4);
  });
});

describe('analysisFunnel', () => {
  it('counts produced, transmitted, visible in the prose and off-screen items', () => {
    expect(analysisFunnel(analysisCards(summary(direction), attribution), true)).toEqual({
      agents: 1, produced: 4, transmitted: 3, inProse: 1, offscreen: 1,
    });
  });

  it('does not guess what the prose shows without an attribution', () => {
    expect(analysisFunnel(analysisCards(summary(direction), null), false).inProse).toBeNull();
  });
});
