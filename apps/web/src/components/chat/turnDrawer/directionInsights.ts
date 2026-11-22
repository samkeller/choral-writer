import type { TensionTarget, TurnMetrics } from '@choral-writer/shared';

/** Named tension levels, from the quietest; a level is an index in this scale. */
export const tensionScale = ['calme', 'frémissement', 'montée', 'crise', 'paroxysme'] as const;

export type TensionLevels = { previous: number; current: number };

const tensionStep = { monter: 1, tenir: 0, relacher: -1, basculer: 0 } satisfies Record<TensionTarget, number>;

/**
 * The Director sets a tension move, not a level: the level is estimated by applying the successive moves
 * from « calme ». A turn without a successful direction keeps the level; so does a « bascule », which turns
 * the scene over without saying whether it calms or heats it.
 */
export function estimateTensionLevels(metrics: readonly TurnMetrics[]): TensionLevels[] {
  const top = tensionScale.length - 1;
  let level = 0;
  return metrics.map(({ direction }) => {
    const previous = level;
    if (direction?.status === 'success') level = Math.min(top, Math.max(0, level + tensionStep[direction.tension]));
    return { previous, current: level };
  });
}

export type StoryDirectionRates = {
  /** Turns whose direction succeeded: the denominator of both shares. */
  directedTurns: number;
  /** Share of directed turns with at least one nudge. */
  nudgeShare: number;
  /** Share of directed turns where a `complication` nudge thwarted an attempt of the protagonist. */
  thwartedShare: number;
};

/** Null for a story without any successful direction. */
export function storyDirectionRates(metrics: readonly TurnMetrics[]): StoryDirectionRates | null {
  const directed = metrics.flatMap(({ direction }) => (direction?.status === 'success' ? [direction] : []));
  if (directed.length === 0) return null;
  return {
    directedTurns: directed.length,
    nudgeShare: directed.filter((direction) => direction.nudges.length > 0).length / directed.length,
    thwartedShare: directed.filter((direction) => direction.nudges.includes('complication')).length / directed.length,
  };
}
