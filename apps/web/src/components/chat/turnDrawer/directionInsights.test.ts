import { describe, expect, it } from 'vitest';
import type { NudgeType, TensionTarget, TurnDirectionMetrics, TurnMetrics } from '@choral-writer/shared';

import { estimateTensionLevels, storyDirectionRates } from './directionInsights';
import { describeTensionMove } from './directionPresentation';

function turn(direction: TurnDirectionMetrics | null): TurnMetrics {
  return {
    turnId: '019ad30c-19b0-7000-8000-000000000801', durationMs: 1000, cost: { microUsd: 100, complete: true },
    narratorInputTokens: 1000, configurationChanges: null, direction,
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

    expect(storyDirectionRates(story)).toEqual({ directedTurns: 4, nudgeShare: 0.5, thwartedShare: 0.25 });
    expect(storyDirectionRates([turn(null), turn({ status: 'error' })])).toBeNull();
  });

  it('tells the tension move on the named scale, or without it when the story is unknown', () => {
    expect(describeTensionMove('monter', { previous: 1, current: 2 }))
      .toBe('Le Directeur fait monter la tension d’un cran : de frémissement à montée.');
    expect(describeTensionMove('monter', { previous: 4, current: 4 }))
      .toBe('Le Directeur fait monter la tension, déjà au plus haut : paroxysme.');
    expect(describeTensionMove('relacher', { previous: 0, current: 0 }))
      .toBe('Le Directeur relâche la tension, déjà au plus bas : calme.');
    expect(describeTensionMove('basculer', { previous: 3, current: 3 }))
      .toBe('Le Directeur fait basculer la scène, sans changer le niveau estimé : crise.');
    expect(describeTensionMove('tenir', null)).toBe('Le Directeur maintient la tension.');
  });
});
