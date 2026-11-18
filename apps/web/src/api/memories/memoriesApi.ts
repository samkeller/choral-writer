import {
  memoryExpectedSchema, memoryMutationSchema, memoryResultSchema, memorySetupProposalSchema, memoryTraceSchema, memoryViewSchema,
  type MemoryMutation, type MemoryView,
} from '@choral-writer/shared';
import { api } from '../client';

const path = (projectId: string, branchId: string) => `/projects/${projectId}/branches/${branchId}/memories`;
export async function getMemory(projectId: string, branchId: string, signal?: AbortSignal) {
  return memoryViewSchema.parse((await api.get<unknown>(path(projectId, branchId), { signal })).data);
}
export async function mutateMemory(view: MemoryView, change: MemoryMutation['change']) {
  const body = memoryMutationSchema.parse({ expectedHeadTurnId: view.headTurnId,
    expectedRevisionId: view.revisionId, expectedCatalogRevisionId: view.catalogRevisionId, change });
  return memoryViewSchema.parse((await api.post<unknown>(path(view.projectId, view.branchId), body)).data);
}
export async function proposeMemorySetup(view: MemoryView, signal?: AbortSignal) {
  const body = memoryExpectedSchema.parse({ expectedHeadTurnId: view.headTurnId,
    expectedRevisionId: view.revisionId, expectedCatalogRevisionId: view.catalogRevisionId });
  return memorySetupProposalSchema.parse((await api.post<unknown>(`${path(view.projectId, view.branchId)}/setup`,
    body, { signal, timeout: 305_000 })).data);
}
export async function getMemoryTrace(projectId: string, turnId: string, signal?: AbortSignal) {
  return memoryTraceSchema.parse((await api.get<unknown>(`/projects/${projectId}/turns/${turnId}/memory`, { signal })).data);
}
export async function retryMemory(view: MemoryView, turnId: string, signal?: AbortSignal) {
  const result = await api.post<unknown>(`/projects/${view.projectId}/branches/${view.branchId}/turns/${turnId}/memory/retry`, {
    expectedHeadTurnId: view.headTurnId, expectedRevisionId: view.revisionId,
    expectedCatalogRevisionId: view.catalogRevisionId,
  }, { signal, timeout: 305_000 });
  return memoryResultSchema.parse(result.data);
}
