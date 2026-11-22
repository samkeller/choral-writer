import type { Agent, ProjectAgentsInput } from '@choral-writer/shared';

import { ApiError } from '../../../errors/errors.js';

type ResolvedSelection = { agentId: string; versionId: string; output: Agent['output'] };

/** A pipeline needs existing versions of distinct agents, exactly one narrator and one Guardian, and at most one Director. */
export function assertValidAgentSelection(
  selections: ProjectAgentsInput['agents'], resolved: readonly ResolvedSelection[],
): void {
  const uniqueIds = new Set(selections.map((selection) => selection.agentId));
  if (uniqueIds.size !== selections.length || resolved.length !== selections.length
    || selections.some((selection) => !resolved.some((version) =>
      version.agentId === selection.agentId && version.versionId === selection.versionId))) {
    throw new ApiError(400, 'INVALID_AGENT_SELECTION', 'Chaque agent doit référencer une de ses versions existantes, sans doublon.');
  }
  if (resolved.filter((agent) => agent.output === 'narrative').length !== 1
    || resolved.filter((agent) => agent.output === 'memory_proposals').length !== 1) {
    throw new ApiError(400, 'REQUIRED_AGENT_OUTPUTS', 'Une configuration doit avoir exactement un agent de réponse et un Gardien mémoire, en restitution.');
  }
  if (resolved.filter((agent) => agent.output === 'direction').length > 1) {
    throw new ApiError(400, 'SINGLE_DIRECTOR', 'Une configuration a au plus un Directeur.');
  }
}
