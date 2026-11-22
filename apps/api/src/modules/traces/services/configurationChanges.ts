import type { TurnConfiguration, TurnConfigurationChange } from '@choral-writer/shared';

/** What changed in the pipeline configuration between two consecutive turns, agents matched by identity. */
export function turnConfigurationChanges(
  previous: TurnConfiguration, current: TurnConfiguration,
): TurnConfigurationChange[] {
  const changes: TurnConfigurationChange[] = [];
  if (previous.systemPrompt !== current.systemPrompt) changes.push({ kind: 'systemPromptChanged' });

  const previousAgents = new Map(previous.agents.map((agent) => [agent.agentId, agent]));
  const currentIds = new Set(current.agents.map((agent) => agent.agentId));
  for (const agent of current.agents) {
    const before = previousAgents.get(agent.agentId);
    if (!before) {
      changes.push({ kind: 'agentAdded', name: agent.name, version: agent.version });
    } else if (before.versionId !== agent.versionId) {
      changes.push({ kind: 'agentChanged', name: agent.name, fromVersion: before.version, toVersion: agent.version });
    }
  }
  for (const agent of previous.agents) {
    if (!currentIds.has(agent.agentId)) changes.push({ kind: 'agentRemoved', name: agent.name, version: agent.version });
  }
  return changes;
}
