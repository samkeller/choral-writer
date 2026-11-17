import type {
  ChatBranch, ChatCommand, ChatHistory, ChatTurn,
} from '@choral-writer/shared';

import { prepareTurn } from './prepareTurn.js';
import type {
  ChatProgressEvent, ChatRunResult, ChatServiceDependencies, ChatTransactionContext, GenerationOutcome,
} from '../types/chat.types.js';
import { isAnalysisAgent } from './analysisService.js';

const NARRATOR_CONTEXT_TURN_LIMIT = 20;

/** Coordinates each pipeline stage; every send, retry or regeneration is a new execution. */
export class ChatService {
  constructor(private readonly dependencies: ChatServiceDependencies) {}

  async branches(projectId: string): Promise<ChatBranch[]> {
    await this.dependencies.projects.get(projectId);
    return this.dependencies.servicesForProject(projectId).branches.list();
  }

  async history(projectId: string, branchId: string): Promise<ChatHistory> {
    await this.dependencies.projects.get(projectId);
    const services = this.dependencies.servicesForProject(projectId);
    const branch = await services.branches.get(branchId);
    return { branch, turns: await services.turns.path(branch.headTurnId) };
  }

  async turn(projectId: string, turnId: string): Promise<ChatTurn> {
    await this.dependencies.projects.get(projectId);
    return this.dependencies.servicesForProject(projectId).turns.get(turnId);
  }

  async run(
    command: ChatCommand,
    emit: (event: ChatProgressEvent) => Promise<void>,
    signal: AbortSignal,
  ): Promise<ChatRunResult> {
    return this.dependencies.withProjectTransaction(command.projectId, async (context) => {
      const input = await prepareTurn(context, command);
      const history = await context.turns.path(input.parentTurnId, NARRATOR_CONTEXT_TURN_LIMIT);
      const narrator = context.projectAgents.find((agent) => agent.output === 'narrative');
      if (!narrator) throw new Error('Project has no narrator assignment.');
      const turnId = await context.turns.start(input);

      let outcome: GenerationOutcome;
      try {
        await emit({
          type: 'chat.turn.started', turnId, branchId: input.branchId,
          operation: command.operation, message: input.userMessage,
        });
        const whiteboard = await this.dependencies.analyze({
          turnId,
          agents: context.projectAgents.filter(isAnalysisAgent),
          systemPrompt: context.project.systemPrompt,
          history,
          userMessage: input.userMessage,
          signal,
        });
        const content = await this.dependencies.narrate({
          turnId,
          agentId: narrator.agentId,
          agentVersionId: narrator.versionId,
          systemPrompt: [context.project.systemPrompt, narrator.instructions]
            .filter(Boolean)
            .join('\n\n'),
          whiteboard,
          history,
          userMessage: input.userMessage,
          signal,
          onDelta: (delta) => emit({ type: 'chat.message.delta', delta }),
        });
        outcome = { status: 'completed', content };
      } catch (error) {
        outcome = { status: 'failed', error };
      }
      return this.finishTurn(context, turnId, input.branchId, outcome);
    });
  }

  private async finishTurn(
    context: ChatTransactionContext, turnId: string, branchId: string, outcome: GenerationOutcome,
  ): Promise<ChatRunResult> {
    const at = new Date();
    const result: ChatRunResult = outcome.status === 'completed'
      ? { status: 'completed', turnId, branchId, message: await context.messages.createAssistant(outcome.content, at) }
      : { status: 'failed', turnId, branchId, error: outcome.error };
    await context.turns.finish(turnId, branchId, result, at);
    await context.branches.advance(branchId, turnId);
    await context.recordActivity(at);
    return result;
  }
}
