import {
  agentInputSchema, agentSchema, projectAgentSchema, projectAgentsInputSchema, publishAgentVersionSchema,
  type AgentInput, type ProjectAgentsInput, type PublishAgentVersion,
} from '@choral-writer/shared';
import { api } from '../client';

export async function listAgents(signal?: AbortSignal) {
  const response = await api.get<unknown>('/agents', { signal });
  return agentSchema.array().parse(response.data);
}

export async function createAgent(input: AgentInput) {
  const response = await api.post<unknown>('/agents', agentInputSchema.parse(input));
  return agentSchema.parse(response.data);
}

export async function publishAgentVersion(agentId: string, input: PublishAgentVersion) {
  const response = await api.post<unknown>(`/agents/${agentId}/versions`, publishAgentVersionSchema.parse(input));
  return agentSchema.parse(response.data);
}

export async function deleteAgent(agentId: string) {
  await api.delete<void>(`/agents/${agentId}`);
}

export async function listProjectAgents(projectId: string, signal?: AbortSignal) {
  const response = await api.get<unknown>(`/projects/${projectId}/agents`, { signal });
  return projectAgentSchema.array().parse(response.data);
}

export async function configureProjectAgents(projectId: string, input: ProjectAgentsInput) {
  const response = await api.put<unknown>(
    `/projects/${projectId}/agents`, projectAgentsInputSchema.parse(input),
  );
  return projectAgentSchema.array().parse(response.data);
}
