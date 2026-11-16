import { messageSchema, projectInputSchema, projectSchema, type ProjectInput } from '@choral-writer/shared';

import { api } from './client.js';

export async function listProjects(signal?: AbortSignal) {
  const response = await api.get<unknown>('/projects', { signal });
  return projectSchema.array().parse(response.data);
}

export async function getProject(id: string, signal?: AbortSignal) {
  const response = await api.get<unknown>(`/projects/${id}`, { signal });
  return projectSchema.parse(response.data);
}

export async function createProject(input: ProjectInput) {
  const response = await api.post<unknown>('/projects', projectInputSchema.parse(input));
  return projectSchema.parse(response.data);
}

export async function updateProject(id: string, input: ProjectInput) {
  const response = await api.put<unknown>(`/projects/${id}`, projectInputSchema.parse(input));
  return projectSchema.parse(response.data);
}

export async function deleteProject(id: string) {
  await api.delete(`/projects/${id}`);
}

export async function getMessages(id: string, signal?: AbortSignal) {
  const response = await api.get<unknown>(`/projects/${id}/messages`, { signal });
  return messageSchema.array().parse(response.data);
}
