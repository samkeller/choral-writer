import { describe, expect, it } from 'vitest';
import type { TurnDirection, TurnTraceSummary } from '@choral-writer/shared';

import { aggregateMeasures, measureTurn, type TurnMeasure } from './turnMeasures.js';

type Call = TurnTraceSummary['calls'][number];

function call(stage: string, overrides: Partial<Call> = {}): Call {
  return {
    id: '00000000-0000-7000-8000-000000000001', turnId: '00000000-0000-7000-8000-000000000002', stage,
    agentId: null, agentVersionId: null, agentName: null, agentVersion: null, model: 'test', status: 'success',
    inputTokens: 100, outputTokens: 10, durationMs: 5, createdAt: '2026-11-27T00:00:00.000Z', error: null,
    costMicroUsd: 10, costBasis: 'priced', composition: null, ...overrides,
  };
}

const direction: TurnDirection = { tension: 'tenir', nudges: [], retained: [], dismissed: [] };
const development = (scope: 'scene' | 'offscreen') => ({
  agent: 'Hors champ', item: { kind: 'development' as const, characters: ['Ysé'], scope, text: 'Fait.', importance: 'NORMAL' as const },
});

function summary(overrides: Partial<TurnTraceSummary> = {}): TurnTraceSummary {
  return {
    turnId: '00000000-0000-7000-8000-000000000002', analysis: [], direction: null, developments: null,
    narrator: { status: 'success', durationMs: 5, prose: 'Trois mots ici.' },
    calls: [call('narrator')], timeline: [], durationMs: 1_200, cost: { microUsd: 40, complete: true }, configuration: null,
    ...overrides,
  };
}

const turn = { index: 1, probe: 'ouverture' as const, status: 'completed' as const };

describe('measureTurn', () => {
  it('reduces a turn to numbers: cost, calls, developments, direction and history share', () => {
    const measure = measureTurn(turn, summary({
      calls: [
        call('analysis', { status: 'error' }), call('analysis'), call('direction'),
        call('narrator', { composition: [{ part: 'rules', estimatedTokens: 25 }, { part: 'history', estimatedTokens: 75 }] }),
      ],
      direction: {
        agentId: null, agentVersionId: null, name: 'Directeur', status: 'success', durationMs: 1, attempts: 1,
        cost: { microUsd: 1, complete: true }, direction,
      },
      developments: { scene: [development('scene')], offscreen: [development('offscreen'), development('offscreen')] },
    }));
    expect(measure).toMatchObject({
      durationMs: 1_200, costMicroUsd: 40, costComplete: true, calls: 4, failedCalls: 1, direction: 'reussie',
      sceneDevelopments: 1, offscreenDevelopments: 2, historyShare: 0.75, narratorInputTokens: 100, proseWords: 3,
    });
  });

  it('tells a Director fallback from a turn without Director', () => {
    expect(measureTurn(turn, summary()).direction).toBe('absente');
    expect(measureTurn(turn, summary({
      direction: {
        agentId: null, agentVersionId: null, name: 'Directeur', status: 'error', durationMs: 1, attempts: 2,
        cost: { microUsd: 0, complete: false }, direction: null,
      },
    })).direction).toBe('repli');
  });

  it('measures a failed turn without prose nor Narrator composition', () => {
    const measure = measureTurn({ ...turn, status: 'failed' }, summary({ narrator: null, calls: [call('analysis', { status: 'error' })] }));
    expect(measure).toMatchObject({ status: 'failed', proseWords: 0, historyShare: null, narratorInputTokens: null, failedCalls: 1 });
  });
});

describe('aggregateMeasures', () => {
  const measure = (overrides: Partial<TurnMeasure>): TurnMeasure => ({
    index: 1, probe: 'ouverture', status: 'completed', durationMs: 1_000, costMicroUsd: 100, costComplete: true,
    calls: 2, failedCalls: 0, direction: 'absente', sceneDevelopments: 0, offscreenDevelopments: 0,
    historyShare: null, narratorInputTokens: 10, proseWords: 100, ...overrides,
  });

  it('sums costs and calls, and rates failures and Director fallbacks', () => {
    const aggregate = aggregateMeasures([
      measure({ historyShare: 0, direction: 'reussie', sceneDevelopments: 2, offscreenDevelopments: 1 }),
      measure({ status: 'failed', failedCalls: 2, costComplete: false, direction: 'repli', proseWords: 0, durationMs: 3_000 }),
      measure({ historyShare: 0.6, direction: 'reussie', proseWords: 300 }),
      measure({ historyShare: 0.7, direction: 'reussie', costMicroUsd: 400 }),
    ]);
    expect(aggregate).toEqual({
      turns: 4, failedTurns: 1, failureRate: 0.25, totalCostMicroUsd: 700, costComplete: false, meanCostMicroUsd: 175,
      meanDurationMs: 1_500, maxDurationMs: 3_000, calls: 8, failedCalls: 2, directedTurns: 4, directorFallbacks: 1,
      sceneDevelopments: 2, offscreenDevelopments: 1, firstHistoryShare: 0, lastHistoryShare: 0.7,
      // The failed turn wrote no prose: it is left out of the mean.
      meanProseWords: 500 / 3,
    });
  });

  it('stays defined for an empty scenario', () => {
    expect(aggregateMeasures([])).toMatchObject({ turns: 0, failureRate: 0, maxDurationMs: 0, firstHistoryShare: null });
  });
});
