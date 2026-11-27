import type {
  AnalysisTrace, AttributedDevelopment, ContextComposition, DirectionTrace, NarratorTrace, StageDuration, TraceCallDetail, TraceCallSummary,
  TurnConfiguration, TurnConfigurationChange, TurnDevelopments, TurnDirection, TurnDirectionMetrics, TurnMetrics,
  TurnTraceSummary,
} from '@choral-writer/shared';
import { contextCompositionSchema, recordedAnalysisEnvelopeSchema, traceCallDetailSchema } from '@choral-writer/shared';

import type { MetricCallRecord, TraceDetailRecord, TraceSummaryRecord } from '../repositories/traceRepository.js';

/** The fields of a recorded call that time and price a turn. */
type MeasuredCall = Pick<MetricCallRecord, 'id' | 'stage' | 'agentId' | 'agentVersionId' | 'durationMs' | 'createdAt' | 'costMicroUsd'>;

/** Calls of one agent; a call whose agent is unknown stands alone. */
function agentKey(call: Pick<MeasuredCall, 'id' | 'agentId' | 'agentVersionId'>): string {
  return call.agentVersionId ?? call.agentId ?? call.id;
}

export function toTraceCallSummaryDto(trace: TraceSummaryRecord, turnId: string): TraceCallSummary {
  return {
    id: trace.id,
    turnId,
    stage: trace.stage,
    agentId: trace.agentId,
    agentVersionId: trace.agentVersionId,
    agentName: trace.agentName,
    agentVersion: trace.agentVersion,
    model: trace.model,
    status: trace.status,
    inputTokens: trace.inputTokens,
    outputTokens: trace.outputTokens,
    durationMs: trace.durationMs,
    createdAt: trace.createdAt.toISOString(),
    error: trace.status === 'error' ? 'L’appel LLM a échoué.' : null,
    costMicroUsd: trace.costMicroUsd,
    costBasis: trace.costBasis,
    composition: toComposition(trace.composition),
  };
}

/** Null for a call recorded before compositions were, or whose recorded composition is unreadable. */
function toComposition(recorded: unknown): ContextComposition | null {
  const result = contextCompositionSchema.safeParse(recorded);
  return result.success ? result.data : null;
}

export function toTraceCallDetailDto(trace: TraceDetailRecord, turnId: string): TraceCallDetail {
  return traceCallDetailSchema.parse({
    ...toTraceCallSummaryDto(trace, turnId),
    request: trace.request,
    response: trace.response,
  });
}

export function toTurnTraceSummaryDto(
  turn: {
    id: string; configuration: TurnConfiguration | null; direction: TurnDirection | null;
    developments: AttributedDevelopment[] | null; completedAt: Date | null;
  },
  traces: readonly TraceSummaryRecord[],
): TurnTraceSummary {
  const turnId = turn.id;
  const analysisTraces = traces.filter((trace) => trace.stage === 'analysis');
  const groups = new Map<string, TraceSummaryRecord[]>();
  for (const trace of analysisTraces) {
    const key = agentKey(trace);
    groups.set(key, [...(groups.get(key) ?? []), trace]);
  }

  const analysis: AnalysisTrace[] = [];
  for (const calls of groups.values()) {
    const latest = calls.at(-1);
    if (!latest) continue;
    const successful = [...calls].reverse().find((call) => call.status === 'success');
    const envelope = successful ? parseAnalysisEnvelope(successful.response) : null;
    analysis.push({
      agentId: latest.agentId,
      agentVersionId: latest.agentVersionId,
      name: latest.agentName ?? envelope?.agent ?? 'Agent inconnu',
      status: envelope ? 'success' : 'error',
      durationMs: calls.reduce((total, call) => total + call.durationMs, 0),
      attempts: calls.length,
      envelope,
    });
  }

  const directionCalls = traces.filter((trace) => trace.stage === 'direction');
  const directionCall = directionCalls.at(-1);
  const outcome = directionOutcome(turn.direction, directionCalls);
  const directionTrace: DirectionTrace | null = directionCall && outcome ? {
    agentId: directionCall.agentId,
    agentVersionId: directionCall.agentVersionId,
    name: directionCall.agentName ?? 'Directeur',
    status: outcome.status,
    durationMs: directionCalls.reduce((total, call) => total + call.durationMs, 0),
    attempts: directionCalls.length,
    cost: toTurnCost(directionCalls),
    direction: turn.direction,
  } : null;

  const narratorCalls = traces.filter((trace) => trace.stage === 'narrator');
  const narratorCall = narratorCalls.at(-1);
  let narrator: NarratorTrace | null = null;
  if (narratorCall) {
    const prose = narratorCall.status === 'success' ? narratorCall.response : null;
    narrator = {
      status: prose ? 'success' : 'error',
      durationMs: narratorCalls.reduce((total, call) => total + call.durationMs, 0),
      prose,
    };
  }

  const timeline = toStageTimeline(callsDuringTurn(traces, turn.completedAt));
  return {
    turnId,
    analysis,
    direction: directionTrace,
    developments: turn.developments && splitByScope(turn.developments),
    narrator,
    calls: traces.map((trace) => toTraceCallSummaryDto(trace, turnId)),
    timeline,
    durationMs: totalDuration(timeline),
    cost: toTurnCost(traces),
    configuration: turn.configuration,
  };
}

export function toTurnMetricsDto(
  turn: { id: string; direction: TurnDirection | null; completedAt: Date | null },
  calls: readonly MetricCallRecord[],
  configurationChanges: TurnConfigurationChange[] | null,
): TurnMetrics {
  const narratorCall = calls.filter((call) => call.stage === 'narrator').at(-1);
  return {
    turnId: turn.id,
    durationMs: totalDuration(toStageTimeline(callsDuringTurn(calls, turn.completedAt))),
    cost: toTurnCost(calls),
    narratorInputTokens: narratorCall?.inputTokens ?? null,
    narratorComposition: narratorCall ? toComposition(narratorCall.composition) : null,
    configurationChanges,
    direction: toDirectionMetrics(turn.direction, calls),
  };
}

function splitByScope(developments: readonly AttributedDevelopment[]): TurnDevelopments {
  return {
    scene: developments.filter((development) => development.item.scope === 'scene'),
    offscreen: developments.filter((development) => development.item.scope === 'offscreen'),
  };
}

function toDirectionMetrics(
  direction: TurnDirection | null, calls: readonly Pick<MeasuredCall, 'stage'>[],
): TurnDirectionMetrics | null {
  const outcome = directionOutcome(direction, calls);
  if (outcome?.status !== 'success') return outcome;
  return { status: 'success', tension: outcome.direction.tension, nudges: outcome.direction.nudges.map((nudge) => nudge.type) };
}

type DirectionOutcome = { status: 'success'; direction: TurnDirection } | { status: 'error' };

/**
 * A direction is recorded only after a validated Director call: a Director call without one means the
 * direction failed and the narrator fell back to the whole whiteboard. Null for a turn without a Director.
 */
function directionOutcome(
  direction: TurnDirection | null, calls: readonly Pick<MeasuredCall, 'stage'>[],
): DirectionOutcome | null {
  if (direction) return { status: 'success', direction };
  return calls.some((call) => call.stage === 'direction') ? { status: 'error' } : null;
}

/**
 * A memory retry records its calls under the turn long after it finished: they belong to the turn's
 * cost, not to its duration. Calls of the run itself are recorded before the turn is completed.
 */
function callsDuringTurn<Call extends MeasuredCall>(calls: readonly Call[], completedAt: Date | null): Call[] {
  return completedAt ? calls.filter((call) => call.createdAt <= completedAt) : [...calls];
}

function totalDuration(timeline: readonly StageDuration[]): number {
  return timeline.reduce((total, stage) => total + stage.durationMs, 0);
}

/**
 * Stages in order of first call. Agents of a stage run in parallel: a stage lasts as long as its
 * slowest agent, whose retries add up.
 */
function toStageTimeline(calls: readonly MeasuredCall[]): StageDuration[] {
  const stages = new Map<string, Map<string, number>>();
  for (const call of calls) {
    const agents = stages.get(call.stage) ?? new Map<string, number>();
    const key = agentKey(call);
    agents.set(key, (agents.get(key) ?? 0) + call.durationMs);
    stages.set(call.stage, agents);
  }
  return [...stages].map(([stage, agents]) => ({
    stage,
    durationMs: Math.max(...agents.values()),
    agentCount: agents.size,
  }));
}

/** Somme des montants connus ; un appel sans montant rend le total partiel plutôt que faux. */
function toTurnCost(traces: readonly Pick<MeasuredCall, 'costMicroUsd'>[]): TurnTraceSummary['cost'] {
  return {
    microUsd: traces.reduce((total, trace) => total + (trace.costMicroUsd ?? 0), 0),
    complete: traces.every((trace) => trace.costMicroUsd !== null),
  };
}

function parseAnalysisEnvelope(response: string | null) {
  if (!response) return null;
  try {
    const parsed: unknown = JSON.parse(response);
    const result = recordedAnalysisEnvelopeSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}
