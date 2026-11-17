import { traceCallDetailSchema, turnTraceSummarySchema } from '@choral-writer/shared';

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
