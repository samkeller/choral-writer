import { chatBranchSchema, chatHistorySchema, chatTurnSchema } from '@choral-writer/shared';

import { api } from '../client';

export { streamTurn } from './chatStream';

export async function getBranches(projectId: string, signal?: AbortSignal) {
  const response = await api.get<unknown>(`/projects/${projectId}/branches`, { signal });
  return chatBranchSchema.array().parse(response.data);
}

export async function getChatHistory(projectId: string, branchId: string, signal?: AbortSignal) {
  const response = await api.get<unknown>(`/projects/${projectId}/branches/${branchId}/history`, { signal });
  return chatHistorySchema.parse(response.data);
}

export async function getChatTurn(projectId: string, turnId: string, signal?: AbortSignal) {
  const response = await api.get<unknown>(`/projects/${projectId}/turns/${turnId}`, { signal });
  return chatTurnSchema.parse(response.data);
}