import type { Transaction } from '../../../db/client.js';
import type { ProjectsService } from '../../projects/service.js';
import type { ChatEntityServices, ChatTransactionContext } from '../types/chat.types.js';

export class ChatTransactionService {
  constructor(
    private readonly projects: ProjectsService,
    private readonly servicesForTransaction: (tx: Transaction, projectId: string) => ChatEntityServices,
  ) {}

  run<T>(projectId: string, work: (context: ChatTransactionContext) => Promise<T>): Promise<T> {
    return this.projects.withLockedProject(projectId, (project, tx) => work({
      project,
      ...this.servicesForTransaction(tx, projectId),
      recordActivity: (at) => this.projects.recordActivity(tx, projectId, at),
    }));
  }
}
