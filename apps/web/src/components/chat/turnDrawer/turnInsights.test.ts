import { describe, expect, it } from 'vitest';
import type { TurnMetrics, TurnTraceSummary } from '@choral-writer/shared';

import { attentionPoints, averageCompleteCost } from './turnInsights';

const turnId = '019ad30c-19b0-7000-8000-000000000501';

function metrics(microUsd: number, overrides: Partial<TurnMetrics> = {}): TurnMetrics {
  return {
    turnId, durationMs: 1000, cost: { microUsd, complete: true },
    narratorInputTokens: 1000, configurationChanges: null, ...overrides,
  };
}

function summary(microUsd: number, overrides: Partial<TurnTraceSummary> = {}): TurnTraceSummary {
  return {
    turnId, analysis: [], narrator: null, calls: [], timeline: [],
    cost: { microUsd, complete: true }, configuration: null, ...overrides,
  };
}

describe('turn insights', () => {
  it('averages only the turns whose cost is complete', () => {
    expect(averageCompleteCost([metrics(100), metrics(300), metrics(5000, { cost: { microUsd: 5000, complete: false } })]))
      .toBe(200);
    expect(averageCompleteCost([])).toBeNull();
  });

  it('flags nothing for an ordinary turn', () => {
    expect(attentionPoints(summary(100), [metrics(100), metrics(100)], 1)).toEqual([]);
  });

  it('flags a costly turn, a growing Narrator input and a configuration change', () => {
    const story = [
      metrics(100),
      metrics(400, {
        narratorInputTokens: 2000,
        configurationChanges: [{ kind: 'systemPromptChanged' }],
      }),
    ];

    expect(attentionPoints(summary(400), story, 1)).toEqual([
      { kind: 'costAboveAverage', microUsd: 400, averageMicroUsd: 250 },
      { kind: 'narratorInputGrowth', tokens: 2000, previousTokens: 1000 },
      { kind: 'configurationChanged', changes: [{ kind: 'systemPromptChanged' }] },
    ]);
  });

  it('reports a partial cost and failed calls instead of comparing an unknown amount', () => {
    const failedCall = {
      id: '019ad30c-19b0-7000-8000-000000000502', turnId, stage: 'narrator', agentId: null, agentVersionId: null,
      agentName: null, agentVersion: null, model: 'test-model', status: 'error' as const, inputTokens: null,
      outputTokens: null, durationMs: 10, createdAt: '2025-01-01T00:00:00.000Z', error: 'Échec.',
      costMicroUsd: null, costBasis: null,
    };
    const partial = summary(9000, { cost: { microUsd: 9000, complete: false }, calls: [failedCall] });

    expect(attentionPoints(partial, [metrics(100), metrics(9000)], 1)).toEqual([
      { kind: 'partialCost' },
      { kind: 'failedCalls', count: 1 },
    ]);
  });
});
