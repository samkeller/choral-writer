import type { Database, Transaction } from '../../db/client.js';
import type { createCallLLM } from '../../llm/call-llm.js';
import type { ProjectsService } from '../projects/services/projectServices.js';
import { ChatService } from './services/chatService.js';
import { ChatAnalysisService } from './services/analysisService.js';
import { ChatBranchService } from './services/branchService.js';
import { ChatMessageService } from './services/messageService.js';
import { ChatTurnService } from './services/turnService.js';
import type { ChatEntityServices } from './types/chat.types.js';
import { ChatNarratorService } from './services/narratorService.js';
import { ChatBranchRepository } from './repositories/branchRepository.js';
import { ChatMessageRepository } from './repositories/messageRepository.js';
import { ChatTurnRepository } from './repositories/turnRepository.js';
import { ChatTransactionService } from './services/chatTransactionService.js';

export type { ChatService } from './services/chatService.js';
export { ChatController } from './controllers/chatController.js';

/** Also used by project creation to initialize chat through its branch service. */
export function createChatBranchService(connection: Database | Transaction, projectId: string): ChatBranchService {
  return new ChatBranchService(new ChatBranchRepository(connection, projectId));
}

function createEntityServices(connection: Database | Transaction, projectId: string): ChatEntityServices {
  return {
    branches: createChatBranchService(connection, projectId),
    messages: new ChatMessageService(new ChatMessageRepository(connection, projectId)),
    turns: new ChatTurnService(new ChatTurnRepository(connection, projectId)),
  };
}

export function createChatService(
  database: Database, projects: ProjectsService, callLLM: ReturnType<typeof createCallLLM>,
): ChatService {
  const transaction = new ChatTransactionService(projects, createEntityServices);
  const analysis = new ChatAnalysisService(callLLM);
  const narrator = new ChatNarratorService(callLLM);
  return new ChatService({
    projects,
    servicesForProject: (projectId) => createEntityServices(database, projectId),
    withProjectTransaction: (projectId, work) => transaction.run(projectId, work),
    analyze: (input) => analysis.generate(input),
    narrate: (input) => narrator.generate(input),
  });
}
