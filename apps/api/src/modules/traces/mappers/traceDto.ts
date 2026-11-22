import type {
  AnalysisTrace, NarratorTrace, StageDuration, TraceCallDetail, TraceCallSummary, TurnConfiguration,
  TurnConfigurationChange, TurnMetrics, TurnTraceSummary,
} from '@choral-writer/shared';
import { analysisEnvelopeSchema, traceCallDetailSchema } from '@choral-writer/shared';

import type { TraceDetailRecord, TraceSummaryRecord } from '../repositories/traceRepository.js';

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
  };
}

export function toTraceCallDetailDto(trace: TraceDetailRecord, turnId: string): TraceCallDetail {
  return traceCallDetailSchema.parse({
    ...toTraceCallSummaryDto(trace, turnId),
    request: trace.request,
    response: trace.response,
  });
}

export function toTurnTraceSummaryDto(
  turnId: string, traces: readonly TraceSummaryRecord[], configuration: TurnConfiguration | null,
): TurnTraceSummary {
  const analysisTraces = traces.filter((trace) => trace.stage === 'analysis');
  const groups = new Map<string, TraceSummaryRecord[]>();
  for (const trace of analysisTraces) {
    const key = trace.agentVersionId ?? trace.agentId ?? trace.id;
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

  return {
    turnId,
    analysis,
    narrator,
    calls: traces.map((trace) => toTraceCallSummaryDto(trace, turnId)),
    timeline: toStageTimeline(traces),
    cost: toTurnCost(traces),
    configuration,
  };
}

export function toTurnMetricsDto(
  turnId: string,
  traces: readonly TraceSummaryRecord[],
  configurationChanges: TurnConfigurationChange[] | null,
): TurnMetrics {
  const narratorCall = traces.filter((trace) => trace.stage === 'narrator').at(-1);
  return {
    turnId,
    durationMs: toStageTimeline(traces).reduce((total, stage) => total + stage.durationMs, 0),
    cost: toTurnCost(traces),
    narratorInputTokens: narratorCall?.inputTokens ?? null,
    configurationChanges,
  };
}

/**
 * Stages in order of first call. Agents of a stage run in parallel: a stage lasts as long as its
 * slowest agent, whose retries add up.
 */
function toStageTimeline(traces: readonly TraceSummaryRecord[]): StageDuration[] {
  const stages = new Map<string, Map<string, number>>();
  for (const trace of traces) {
    const agents = stages.get(trace.stage) ?? new Map<string, number>();
    const agentKey = trace.agentVersionId ?? trace.agentId ?? trace.stage;
    agents.set(agentKey, (agents.get(agentKey) ?? 0) + trace.durationMs);
    stages.set(trace.stage, agents);
  }
  return [...stages].map(([stage, agents]) => ({
    stage,
    durationMs: Math.max(...agents.values()),
    agentCount: agents.size,
  }));
}

/** Somme des montants connus ; un appel sans montant rend le total partiel plutôt que faux. */
function toTurnCost(traces: readonly TraceSummaryRecord[]): TurnTraceSummary['cost'] {
  return {
    microUsd: traces.reduce((total, trace) => total + (trace.costMicroUsd ?? 0), 0),
    complete: traces.every((trace) => trace.costMicroUsd !== null),
  };
}

function parseAnalysisEnvelope(response: string | null) {
  if (!response) return null;
  try {
    const parsed: unknown = JSON.parse(response);
    const result = analysisEnvelopeSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}
