import type {
  AnalysisTrace, DirectionTrace, NarratorTrace, TraceCallDetail, TraceCallSummary, TurnConfiguration, TurnDirection,
  TurnTraceSummary,
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
  direction: TurnDirection | null,
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

  const directionCalls = traces.filter((trace) => trace.stage === 'direction');
  const directionCall = directionCalls.at(-1);
  const directionTrace: DirectionTrace | null = directionCall ? {
    agentId: directionCall.agentId,
    agentVersionId: directionCall.agentVersionId,
    name: directionCall.agentName ?? 'Directeur',
    status: direction ? 'success' : 'error',
    durationMs: directionCalls.reduce((total, call) => total + call.durationMs, 0),
    attempts: directionCalls.length,
    direction,
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

  return {
    turnId,
    analysis,
    direction: directionTrace,
    narrator,
    calls: traces.map((trace) => toTraceCallSummaryDto(trace, turnId)),
    cost: toTurnCost(traces),
    configuration,
  };
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
