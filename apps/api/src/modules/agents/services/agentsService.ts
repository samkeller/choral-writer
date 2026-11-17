import type { Agent, AgentInput, ProjectAgent, ProjectAgentsInput, PublishAgentVersion } from '@choral-writer/shared';

import { ApiError, notfoundError } from '../../../errors/errors.js';
import type { Database } from '../../../db/client.js';
import type { ProjectsService } from '../../projects/services/projectServices.js';
import { AgentRepository } from '../repository/agentsRepository.js';
import { DEFAULT_GUARDIAN_ID, DEFAULT_NARRATOR_ID } from '../repository/defaultNarrators.js';

export class AgentsService {
  constructor(private readonly database: Database, private readonly projects: ProjectsService) {}

  list(): Promise<Agent[]> {
    return this.database.transaction((tx) => new AgentRepository(tx).list(), {
      isolationLevel: 'repeatable read', accessMode: 'read only',
    });
  }

  async create(input: AgentInput): Promise<Agent> {
    return this.database.transaction(async (tx) => {
      const repository = new AgentRepository(tx);
      const id = await repository.create(input);
      const agent = (await repository.list()).find((entry) => entry.id === id);
      if (!agent) throw new Error('Missing newly created agent.');
      return agent;
    });
  }

  async publish(agentId: string, input: PublishAgentVersion): Promise<Agent> {
    return this.database.transaction(async (tx) => {
      const repository = new AgentRepository(tx);
      if (!await repository.lock(agentId)) throw notfoundError('Cet agent n’existe pas.');
      const latest = await repository.latestVersion(agentId);
      if (latest !== input.expectedVersion) {
        throw new ApiError(409, 'AGENT_VERSION_CHANGED', 'Une version a été publiée. Rechargez la bibliothèque.');
      }
      await repository.publish(agentId, latest + 1, input);
      const agent = (await repository.list()).find((entry) => entry.id === agentId);
      if (!agent) throw new Error('Missing agent after publication.');
      return agent;
    });
  }

  async remove(agentId: string): Promise<void> {
    await this.database.transaction(async (tx) => {
      const repository = new AgentRepository(tx);
      if (!await repository.lock(agentId)) throw notfoundError('Cet agent n’existe pas.');
      if ([DEFAULT_NARRATOR_ID, DEFAULT_GUARDIAN_ID].includes(agentId) || await repository.used(agentId)) {
        throw new ApiError(409, 'AGENT_IN_USE', 'Cet agent est utilisé ou fourni par défaut. Détachez-le des projets avant de le supprimer.');
      }
      await repository.remove(agentId);
    });
  }

  async listForProject(projectId: string): Promise<ProjectAgent[]> {
    await this.projects.get(projectId);
    return new AgentRepository(this.database).listForProject(projectId);
  }

  async configure(projectId: string, input: ProjectAgentsInput): Promise<ProjectAgent[]> {
    return this.projects.withLockedProject(projectId, async (_project, tx) => {
      const repository = new AgentRepository(tx);
      const resolved = await repository.resolveSelections(input.agents);
      const uniqueIds = new Set(input.agents.map((selection) => selection.agentId));
      if (uniqueIds.size !== input.agents.length || resolved.length !== input.agents.length
        || input.agents.some((selection) => !resolved.some((version) =>
          version.agentId === selection.agentId && version.versionId === selection.versionId))) {
        throw new ApiError(400, 'INVALID_AGENT_SELECTION', 'Chaque agent doit référencer une de ses versions existantes, sans doublon.');
      }
      if (resolved.filter((agent) => agent.output === 'narrative').length !== 1
        || resolved.filter((agent) => agent.output === 'memory_proposals').length !== 1) {
        throw new ApiError(400, 'REQUIRED_AGENT_OUTPUTS', 'Le projet doit avoir exactement un agent de réponse et un Gardien mémoire, en restitution.');
      }
      await repository.replace(projectId, resolved);
      return repository.listForProject(projectId);
    });
  }
}
