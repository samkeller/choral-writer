import type {
  AnalysisEnvelope, ChatEvent, TurnDirection, Message, Project, ProjectAgent, ProjectAgentsInput, MemoryResult,
} from '@choral-writer/shared';
import type { MemorySession } from '../../memories/services/memoriesService.js';

import type { ProjectsService } from '../../projects/services/projectServices.js';
import type { AnalysisInput } from '../services/analysisService.js';
import type { DirectorInput } from '../services/directorService.js';
import type { ChatBranchService } from '../services/branchService.js';
import type { ChatMessageService } from '../services/messageService.js';
import type { ChatTurnService } from '../services/turnService.js';
import type { Narrator } from './narrator.types.js';

/** Only progress is provisional; the transport sends terminal events after commit. */
export type ChatProgressEvent = Extract<ChatEvent, {
  type: 'chat.turn.started' | 'chat.message.delta' | 'chat.pipeline.stage' | 'chat.pipeline.agent'
}>;

export type ChatRunResult = { turnId: string; branchId: string } & (
  | { status: 'completed'; message: Message; memory?: MemoryResult }
  | { status: 'failed'; error: unknown }
);

export type GenerationOutcome =
  | { status: 'completed'; content: string }
  | { status: 'failed'; error: unknown };

export type ChatEntityServices = {
  branches: Pick<ChatBranchService, keyof ChatBranchService>;
  messages: Pick<ChatMessageService, keyof ChatMessageService>;
  turns: Pick<ChatTurnService, keyof ChatTurnService>;
};

/** Services are bound to one locked project and must not escape the callback. */
export type ChatTransactionContext = ChatEntityServices & {
  project: Pick<Project, 'id' | 'systemPrompt'>;
  projectAgents: ProjectAgent[];
  /** Validates a selection and resolves it as the pipeline would run it, without touching the project. */
  resolveAgents(selections: ProjectAgentsInput['agents']): Promise<ProjectAgent[]>;
  memory: Pick<MemorySession, 'prepare' | 'process' | 'failed' | 'source'>;
  recordActivity(at: Date): Promise<void>;
};

export type ChatServiceDependencies = {
  projects: Pick<ProjectsService, 'get'>;
  servicesForProject(projectId: string): ChatEntityServices;
  /** Acquires the project NOWAIT lock; resolves only after commit. */
  withProjectTransaction<T>(
    projectId: string,
    work: (context: ChatTransactionContext) => Promise<T>,
  ): Promise<T>;
  analyze(input: AnalysisInput): Promise<AnalysisEnvelope[]>;
  direct(input: DirectorInput): Promise<TurnDirection>;
  narrate: Narrator;
};
