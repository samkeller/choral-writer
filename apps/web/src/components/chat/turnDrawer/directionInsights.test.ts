import { describe, expect, it } from 'vitest';
import type { NudgeType, TensionTarget, TurnDirectionMetrics, TurnMetrics } from '@choral-writer/shared';

import { estimateTensionLevels, storyDirectionRates } from './directionInsights';
import { describeEstimatedLevel } from './directionPresentation';

function turn(direction: TurnDirectionMetrics | null): TurnMetrics {
  return {
    turnId: '019ad30c-19b0-7000-8000-000000000801', durationMs: 1000, cost: { microUsd: 100, complete: true },
    narratorInputTokens: 1000, narratorComposition: null, configurationChanges: null, direction,
  };
}

function directed(tension: TensionTarget, nudges: NudgeType[] = []): TurnMetrics {
  return turn({ status: 'success', tension, nudges });
}

describe('direction insights', () => {
  it('estimates the tension level by applying each directed move from « calme », within the scale', () => {
    const story = [
      directed('relacher'), directed('monter'), turn(null), turn({ status: 'error' }), directed('basculer'),
      directed('monter'), directed('monter'), directed('monter'), directed('monter'), directed('tenir'),
    ];

    expect(estimateTensionLevels(story).map(({ current }) => current)).toEqual([0, 1, 1, 1, 1, 2, 3, 4, 4, 4]);
    expect(estimateTensionLevels(story)[5]).toEqual({ previous: 1, current: 2 });
  });

  it('measures nudges and thwarted attempts over the directed turns only', () => {
    const story = [
      directed('monter', ['complication']), directed('tenir', ['saillance', 'retard']), directed('tenir'),
      directed('monter'), turn(null), turn({ status: 'error' }),
    ];

    expect(storyDirectionRates(story)).toEqual({ directedTurns: 4, nudgeShare: 0.5, complicationShare: 0.25 });
    expect(storyDirectionRates([turn(null), turn({ status: 'error' })])).toBeNull();
  });

  it('tells the estimated level as an estimate, without inventing a cause when a move hits an end of the scale', () => {
    expect(describeEstimatedLevel('monter', { previous: 1, current: 2 })).toBe('Niveau estimé : de frémissement à montée.');
    expect(describeEstimatedLevel('monter', { previous: 4, current: 4 }))
      .toBe('Niveau estimé : paroxysme, inchangé (borne de l’échelle).');
    expect(describeEstimatedLevel('relacher', { previous: 0, current: 0 }))
      .toBe('Niveau estimé : calme, inchangé (borne de l’échelle).');
    expect(describeEstimatedLevel('basculer', { previous: 3, current: 3 })).toBe('Niveau estimé : crise, inchangé.');
  });
});
