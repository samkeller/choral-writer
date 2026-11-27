import type { TurnTraceSummary } from '@choral-writer/shared';

import type { ScenarioProbe } from './evaluationScenario.js';

/** What the direction did on a turn: no Director, a recorded direction, or a fallback to the whole whiteboard. */
export type DirectionOutcome = 'absente' | 'reussie' | 'repli';

/** A turn reduced to numbers: nothing here quotes the story, so it can be published. */
export type TurnMeasure = {
  index: number;
  probe: ScenarioProbe;
  status: 'completed' | 'failed';
  durationMs: number;
  costMicroUsd: number;
  /** False as soon as one call of the turn has no known cost. */
  costComplete: boolean;
  calls: number;
  failedCalls: number;
  direction: DirectionOutcome;
  sceneDevelopments: number;
  offscreenDevelopments: number;
  /** Estimated share of the history in the Narrator's context; null without a measured Narrator call. */
  historyShare: number | null;
  narratorInputTokens: number | null;
  proseWords: number;
};

export function measureTurn(
  turn: { index: number; probe: ScenarioProbe; status: 'completed' | 'failed' }, summary: TurnTraceSummary,
): TurnMeasure {
  const narratorCall = summary.calls.filter((call) => call.stage === 'narrator').at(-1);
  const composition = narratorCall?.composition ?? null;
  const contextTokens = composition?.reduce((sum, part) => sum + part.estimatedTokens, 0) ?? 0;
  const historyTokens = composition?.find((part) => part.part === 'history')?.estimatedTokens ?? 0;
  const prose = summary.narrator?.prose?.trim() ?? '';
  return {
    ...turn,
    durationMs: summary.durationMs,
    costMicroUsd: summary.cost.microUsd,
    costComplete: summary.cost.complete,
    calls: summary.calls.length,
    failedCalls: summary.calls.filter((call) => call.status === 'error').length,
    direction: summary.direction === null ? 'absente' : summary.direction.direction === null ? 'repli' : 'reussie',
    sceneDevelopments: summary.developments?.scene.length ?? 0,
    offscreenDevelopments: summary.developments?.offscreen.length ?? 0,
    historyShare: contextTokens > 0 ? historyTokens / contextTokens : null,
    narratorInputTokens: narratorCall?.inputTokens ?? null,
    proseWords: prose ? prose.split(/\s+/).length : 0,
  };
}

/** The measures of one configuration over the whole scenario. */
export type ConfigurationMeasures = {
  turns: number;
  failedTurns: number;
  failureRate: number;
  totalCostMicroUsd: number;
  costComplete: boolean;
  meanCostMicroUsd: number;
  meanDurationMs: number;
  maxDurationMs: number;
  calls: number;
  failedCalls: number;
  directedTurns: number;
  directorFallbacks: number;
  sceneDevelopments: number;
  offscreenDevelopments: number;
  /** History share of the first and last turns that have one, to see it grow along the story. */
  firstHistoryShare: number | null;
  lastHistoryShare: number | null;
  meanProseWords: number;
};

function mean(values: readonly number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function aggregateMeasures(turns: readonly TurnMeasure[]): ConfigurationMeasures {
  const sum = (pick: (turn: TurnMeasure) => number) => turns.reduce((total, turn) => total + pick(turn), 0);
  const failedTurns = turns.filter((turn) => turn.status === 'failed').length;
  const shares = turns.flatMap((turn) => turn.historyShare === null ? [] : [turn.historyShare]);
  const completed = turns.filter((turn) => turn.status === 'completed');
  return {
    turns: turns.length,
    failedTurns,
    failureRate: turns.length ? failedTurns / turns.length : 0,
    totalCostMicroUsd: sum((turn) => turn.costMicroUsd),
    costComplete: turns.every((turn) => turn.costComplete),
    meanCostMicroUsd: mean(turns.map((turn) => turn.costMicroUsd)),
    meanDurationMs: mean(turns.map((turn) => turn.durationMs)),
    maxDurationMs: Math.max(0, ...turns.map((turn) => turn.durationMs)),
    calls: sum((turn) => turn.calls),
    failedCalls: sum((turn) => turn.failedCalls),
    directedTurns: turns.filter((turn) => turn.direction !== 'absente').length,
    directorFallbacks: turns.filter((turn) => turn.direction === 'repli').length,
    sceneDevelopments: sum((turn) => turn.sceneDevelopments),
    offscreenDevelopments: sum((turn) => turn.offscreenDevelopments),
    firstHistoryShare: shares.at(0) ?? null,
    lastHistoryShare: shares.at(-1) ?? null,
    meanProseWords: mean(completed.map((turn) => turn.proseWords)),
  };
}
