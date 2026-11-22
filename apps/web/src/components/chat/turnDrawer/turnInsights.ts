import type { TurnConfigurationChange, TurnMetrics, TurnTraceSummary } from '@choral-writer/shared';

/** A turn costs notably more than usual beyond this ratio to the story average. */
export const COST_ABOVE_AVERAGE_RATIO = 1.2;
/** The Narrator input grows notably beyond this ratio to the previous turn. */
export const NARRATOR_INPUT_GROWTH_RATIO = 1.3;

export type AttentionPoint =
  | { kind: 'costAboveAverage'; microUsd: number; averageMicroUsd: number }
  | { kind: 'partialCost' }
  | { kind: 'narratorInputGrowth'; tokens: number; previousTokens: number }
  | { kind: 'analysisAgentWithoutEnvelope'; agentName: string; callId: string | null }
  | { kind: 'failedCalls'; count: number }
  | { kind: 'configurationChanged'; changes: TurnConfigurationChange[] };

/** Average cost of the turns whose every call has a known price; null without such turns. */
export function averageCompleteCost(metrics: readonly TurnMetrics[]): number | null {
  const complete = metrics.filter((turn) => turn.cost.complete);
  if (complete.length === 0) return null;
  return complete.reduce((sum, turn) => sum + turn.cost.microUsd, 0) / complete.length;
}

/** What deserves a look in a turn, each point leading to the tab that details it. */
export function attentionPoints(
  summary: TurnTraceSummary, metrics: readonly TurnMetrics[], index: number,
): AttentionPoint[] {
  const points: AttentionPoint[] = [];
  const turn = metrics[index];
  const previous = index > 0 ? metrics[index - 1] : undefined;

  const average = averageCompleteCost(metrics);
  const comparableTurns = metrics.filter((item) => item.cost.complete).length;
  if (summary.cost.complete && average !== null && comparableTurns > 1
    && summary.cost.microUsd > average * COST_ABOVE_AVERAGE_RATIO) {
    points.push({ kind: 'costAboveAverage', microUsd: summary.cost.microUsd, averageMicroUsd: average });
  }
  if (!summary.cost.complete) points.push({ kind: 'partialCost' });

  const tokens = turn?.narratorInputTokens ?? null;
  const previousTokens = previous?.narratorInputTokens ?? null;
  if (tokens !== null && previousTokens && tokens > previousTokens * NARRATOR_INPUT_GROWTH_RATIO) {
    points.push({ kind: 'narratorInputGrowth', tokens, previousTokens });
  }

  for (const agent of summary.analysis.filter((item) => item.status === 'error')) {
    const lastCall = [...summary.calls].reverse().find((call) => call.stage === 'analysis' && (agent.agentVersionId
      ? call.agentVersionId === agent.agentVersionId
      : call.agentId === agent.agentId));
    points.push({ kind: 'analysisAgentWithoutEnvelope', agentName: agent.name, callId: lastCall?.id ?? null });
  }

  const failedCalls = summary.calls.filter((call) => call.status === 'error').length;
  if (failedCalls > 0) points.push({ kind: 'failedCalls', count: failedCalls });

  if (turn?.configurationChanges?.length) {
    points.push({ kind: 'configurationChanged', changes: turn.configurationChanges });
  }
  return points;
}
