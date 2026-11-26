import type { Agent, AgentInput, ProjectAgent, ProjectAgentsInput, PublishAgentVersion } from '@choral-writer/shared';

import { ApiError, notfoundError } from '../../../errors/errors.js';
import type { Database } from '../../../db/client.js';
import type { ProjectsService } from '../../projects/services/projectServices.js';
import { AgentRepository } from '../repository/agentsRepository.js';
import { assertValidAgentSelection } from './agentSelection.js';
import { isBuiltInAgent } from '../repository/agentLibrary.js';

export class AgentsService {
  constructor(private readonly database: Database, private readonly projects: ProjectsService) {}

  /** Run at startup: the library is application data, not a migration, so it is seeded idempotently. */
  ensureLibrary(): Promise<void> {
    return this.database.transaction((tx) => new AgentRepository(tx).ensureLibrary());
  }

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
      if (isBuiltInAgent(agentId) || await repository.used(agentId)) {
        throw new ApiError(409, 'AGENT_IN_USE', 'Cet agent est utilisé ou fourni avec l’application. Détachez-le des projets avant de le supprimer.');
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
      assertValidAgentSelection(input.agents, resolved);
      await repository.replace(projectId, resolved);
      return repository.listForProject(projectId);
    });
  }
}
