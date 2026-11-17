import type { Transaction } from '../../../db/client.js';
import { AgentRepository } from '../../agents/repository/agentsRepository.js';
import type { ProjectsService } from '../../projects/services/projectServices.js';
import type { ChatEntityServices, ChatTransactionContext } from '../types/chat.types.js';

export class ChatTransactionService {
  constructor(
    private readonly projects: ProjectsService,
    private readonly servicesForTransaction: (tx: Transaction, projectId: string) => ChatEntityServices,
  ) {}

  run<T>(projectId: string, work: (context: ChatTransactionContext) => Promise<T>): Promise<T> {
    return this.projects.withLockedProject(projectId, async (project, tx) => work({
      project,
      narratorInstructions: await new AgentRepository(tx).narratorInstructions(projectId),
      ...this.servicesForTransaction(tx, projectId),
      recordActivity: (at) => this.projects.recordActivity(tx, projectId, at),
    }));
  }
}
