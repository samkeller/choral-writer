import { describe, expect, it } from 'vitest';
import type { TurnMetrics, TurnTraceSummary } from '@choral-writer/shared';

import { attentionPoints, averageCompleteCost } from './turnInsights';

const turnId = '019ad30c-19b0-7000-8000-000000000501';

function metrics(microUsd: number, overrides: Partial<TurnMetrics> = {}): TurnMetrics {
  return {
    turnId, durationMs: 1000, cost: { microUsd, complete: true },
    narratorInputTokens: 1000, narratorComposition: null, configurationChanges: null, direction: null, ...overrides,
  };
}

function summary(microUsd: number, overrides: Partial<TurnTraceSummary> = {}): TurnTraceSummary {
  return {
    turnId, analysis: [], direction: null, developments: null, narrator: null, calls: [], timeline: [], durationMs: 0,
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
        narratorInputTokens: 2000, narratorComposition: null,
        configurationChanges: [{ kind: 'systemPromptChanged' }],
      }),
    ];

    expect(attentionPoints(summary(400), story, 1)).toEqual([
      { kind: 'costAboveAverage', microUsd: 400, averageMicroUsd: 250 },
      { kind: 'narratorInputGrowth', tokens: 2000, previousTokens: 1000 },
      { kind: 'configurationChanged', changes: [{ kind: 'systemPromptChanged' }] },
    ]);
  });

  it('names an analysis agent without a valid envelope, pointing to its last call', () => {
    const agent = { agentId: '019ad30c-19b0-7000-8000-000000000503', agentVersionId: '019ad30c-19b0-7000-8000-000000000504' };
    const call = {
      id: '019ad30c-19b0-7000-8000-000000000505', turnId, stage: 'analysis', ...agent, agentName: 'Rythme', agentVersion: 1,
      model: 'test-model', status: 'success' as const, inputTokens: 10, outputTokens: 10, durationMs: 10,
      createdAt: '2025-01-01T00:00:00.000Z', error: null, costMicroUsd: 1, costBasis: 'priced' as const, composition: null,
    };
    const silent = summary(100, {
      analysis: [{ ...agent, name: 'Rythme', status: 'error', durationMs: 10, attempts: 1, envelope: null }],
      calls: [call],
    });

    expect(attentionPoints(silent, [metrics(100), metrics(100)], 1)).toEqual([
      { kind: 'analysisAgentWithoutEnvelope', agentName: 'Rythme', callId: call.id },
    ]);
  });

  it('flags each intervention of the Director, a failed direction and a Director gone since the previous turn', () => {
    const directorTrace = {
      agentId: null, agentVersionId: null, name: 'Directeur', status: 'success' as const, durationMs: 10, attempts: 1,
      cost: { microUsd: 10, complete: true },
      direction: {
        tension: 'monter' as const,
        nudges: [
          { type: 'saillance' as const, target: 'Un objet', basis: null },
          { type: 'complication' as const, target: 'Une tentative', basis: null },
        ],
        retained: [],
        dismissed: [],
      },
    };
    const directedStory = [metrics(100, { direction: { status: 'success', tension: 'tenir', nudges: [] } }), metrics(100)];

    expect(attentionPoints(summary(100, { direction: directorTrace }), [metrics(100), metrics(100)], 1)).toEqual([
      { kind: 'directorNudge', type: 'saillance', target: 'Un objet' },
      { kind: 'directorNudge', type: 'complication', target: 'Une tentative' },
    ]);
    expect(attentionPoints(summary(100, { direction: { ...directorTrace, status: 'error', attempts: 2, direction: null } }),
      [metrics(100), metrics(100)], 1)).toEqual([{ kind: 'directionFailed', attempts: 2 }]);
    expect(attentionPoints(summary(100), directedStory, 1)).toEqual([{ kind: 'directorDisabled' }]);
    expect(attentionPoints(summary(100), [metrics(100), metrics(100)], 1)).toEqual([]);
  });

  it('reports a partial cost and failed calls instead of comparing an unknown amount', () => {
    const failedCall = {
      id: '019ad30c-19b0-7000-8000-000000000502', turnId, stage: 'narrator', agentId: null, agentVersionId: null,
      agentName: null, agentVersion: null, model: 'test-model', status: 'error' as const, inputTokens: null,
      outputTokens: null, durationMs: 10, createdAt: '2025-01-01T00:00:00.000Z', error: 'Échec.',
      costMicroUsd: null, costBasis: null, composition: null,
    };
    const partial = summary(9000, { cost: { microUsd: 9000, complete: false }, calls: [failedCall] });

    expect(attentionPoints(partial, [metrics(100), metrics(9000)], 1)).toEqual([
      { kind: 'partialCost' },
      { kind: 'failedCalls', count: 1 },
    ]);
  });
});
