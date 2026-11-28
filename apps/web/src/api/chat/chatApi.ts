import { chatBranchSchema, chatHistorySchema, chatTurnSchema, projectSchema } from '@choral-writer/shared';

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
/** Makes the variant's configuration the project's and its branch the story's, in one transaction. */
export async function adoptVariant(projectId: string, turnId: string) {
  const response = await api.post<unknown>(`/projects/${projectId}/turns/${turnId}/adoption`);
  return projectSchema.parse(response.data);
}
