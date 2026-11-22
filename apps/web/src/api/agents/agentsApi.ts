import {
  agentInputSchema, agentSchema, projectAgentSchema, projectAgentsInputSchema, publishAgentVersionSchema,
  type Agent, type AgentInput, type AgentVersionInput, type ProjectAgentsInput, type PublishAgentVersion,
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

/** Publishes on top of the latest known version; the API refuses it if another was published meanwhile. */
export async function publishNextVersion(agent: Agent, input: AgentVersionInput) {
  const latest = agent.versions[0];
  if (!latest) throw new Error('Cet agent n’a aucune version.');
  return publishAgentVersion(agent.id, { ...input, expectedVersion: latest.version });
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
