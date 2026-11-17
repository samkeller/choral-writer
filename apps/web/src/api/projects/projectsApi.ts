import { projectInputSchema, projectSchema, type ProjectInput } from '@choral-writer/shared';

import { api } from '../client';

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
  await api.delete<void>(`/projects/${id}`);
}
