import type {
  AnalysisTrace, NarratorTrace, TraceCallDetail, TraceCallSummary, TurnTraceSummary,
} from '@choral-writer/shared';
import { analysisEnvelopeSchema, traceCallDetailSchema } from '@choral-writer/shared';

import { NarratorParseError, parseNarration } from '../../chat/services/narratorParser.js';
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

export async function toTurnTraceSummaryDto(
  turnId: string, traces: readonly TraceSummaryRecord[],
): Promise<TurnTraceSummary> {
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
    let narration = null;
    if (narratorCall.status === 'success' && narratorCall.response) {
      try {
        narration = await parseNarration(narratorCall.response);
      } catch (error) {
        if (!(error instanceof NarratorParseError)) throw error;
      }
    }
    narrator = {
      status: narration ? 'success' : 'error',
      durationMs: narratorCalls.reduce((total, call) => total + call.durationMs, 0),
      resolution: narration?.resolution ?? null,
      prose: narration?.prose ?? null,
    };
  }

  return {
    turnId,
    analysis,
    narrator,
    calls: traces.map((trace) => toTraceCallSummaryDto(trace, turnId)),
    cost: toTurnCost(traces),
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
