import {
  traceCallDetailSchema, turnAttributionResponseSchema, turnMetricsListSchema, turnTraceSummarySchema,
} from '@choral-writer/shared';

import { api } from '../client';

export async function getTurnTraceSummary(projectId: string, turnId: string, signal?: AbortSignal) {
  const response = await api.get<unknown>(`/projects/${projectId}/turns/${turnId}/traces`, { signal });
  return turnTraceSummarySchema.parse(response.data);
}

export async function getTraceCallDetail(
  projectId: string, turnId: string, callId: string, signal?: AbortSignal,
) {
  const response = await api.get<unknown>(
    `/projects/${projectId}/turns/${turnId}/traces/${callId}`, { signal },
  );
  return traceCallDetailSchema.parse(response.data);
}

/** Metrics of every turn on the branch path, root first. */
export async function getTurnMetrics(projectId: string, branchId: string, signal?: AbortSignal) {
  const response = await api.get<unknown>(`/projects/${projectId}/branches/${branchId}/turn-metrics`, { signal });
  return turnMetricsListSchema.parse(response.data);
}

/** The LLM call behind a first attribution may outlast the default request timeout. */
const ATTRIBUTION_TIMEOUT_MS = 120_000;

/** The turn's cached attribution, computed by a small LLM call on first request or when `regenerate` asks for it. */
export async function attributeTurn(projectId: string, turnId: string, regenerate: boolean, signal?: AbortSignal) {
  const response = await api.post<unknown>(
    `/projects/${projectId}/turns/${turnId}/attribution`, { regenerate }, { signal, timeout: ATTRIBUTION_TIMEOUT_MS },
  );
  return turnAttributionResponseSchema.parse(response.data);
}
