import type { Transaction } from '../../../db/client.js';
import { AgentRepository } from '../../agents/repository/agentsRepository.js';
import { assertValidAgentSelection } from '../../agents/services/agentSelection.js';
import type { ProjectsService } from '../../projects/services/projectServices.js';
import type { ChatEntityServices, ChatTransactionContext } from '../types/chat.types.js';
import type { MemoriesService } from '../../memories/services/memoriesService.js';

export class ChatTransactionService {
  constructor(
    private readonly projects: ProjectsService,
    private readonly servicesForTransaction: (tx: Transaction, projectId: string) => ChatEntityServices,
    private readonly memories: MemoriesService,
  ) {}

  run<T>(projectId: string, work: (context: ChatTransactionContext) => Promise<T>): Promise<T> {
    return this.projects.withLockedProject(projectId, async (project, tx) => {
      const agents = new AgentRepository(tx);
      return work({
        project,
        projectAgents: await agents.listForProject(projectId),
        resolveAgents: async (selections) => {
          const resolved = await agents.resolveProjectAgents(projectId, selections);
          assertValidAgentSelection(selections, resolved);
          return resolved;
        },
        memory: this.memories.session(tx, projectId),
        ...this.servicesForTransaction(tx, projectId),
        recordActivity: (at) => this.projects.recordActivity(tx, projectId, at),
      });
    });
  }
}
