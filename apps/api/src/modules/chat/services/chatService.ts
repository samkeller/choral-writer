import type {
  AnalysisEnvelope, ChatBranch, ChatCommand, ChatHistory, ChatTurn, MemoryResult, TurnConfiguration,
} from '@choral-writer/shared';

import { prepareTurn } from './prepareTurn.js';
import { turnConfiguration } from './turnConfiguration.js';
import type {
  ChatProgressEvent, ChatRunResult, ChatServiceDependencies, ChatTransactionContext, GenerationOutcome,
} from '../types/chat.types.js';
import { isAnalysisAgent } from './analysisService.js';
import { memoryContext } from '../../memories/services/memoryState.js';
import type { NarratorOutput } from '../types/narrator.types.js';
import { ApiError } from '../../../errors/errors.js';
import type { z } from 'zod';
import type { memoryExpectedSchema } from '@choral-writer/shared';

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

  async turnConfiguration(projectId: string, turnId: string): Promise<TurnConfiguration | null> {
    await this.dependencies.projects.get(projectId);
    return this.dependencies.servicesForProject(projectId).turns.configuration(turnId);
  }

  async run(
    command: ChatCommand,
    emit: (event: ChatProgressEvent) => Promise<void>,
    signal: AbortSignal,
  ): Promise<ChatRunResult> {
    return this.dependencies.withProjectTransaction(command.projectId, async (context) => {
      const input = await prepareTurn(context, command);
      const memory = await context.memory.prepare(input.branchId, input.regeneratedFromTurnId, command.allowLegacyMemoryReset);
      const history = await context.turns.path(input.parentTurnId, NARRATOR_CONTEXT_TURN_LIMIT);
      const narrator = context.projectAgents.find((agent) => agent.output === 'narrative');
      if (!narrator) throw new Error('Project has no narrator assignment.');
      const turnId = await context.turns.start({
        ...input, memorySnapshot: memory.state,
        configuration: turnConfiguration(context.project.systemPrompt, context.projectAgents),
      });

      let outcome: GenerationOutcome;
      let narration: NarratorOutput | undefined;
      let memoryResult: MemoryResult | undefined;
      try {
        await emit({
          type: 'chat.turn.started', turnId, branchId: input.branchId,
          operation: command.operation, message: input.userMessage,
        });
        const analysisAgents = context.projectAgents.filter(isAnalysisAgent);
        const analysisStartedAt = performance.now();
        await emit({
          type: 'chat.pipeline.stage', turnId, stage: 'analysis', status: 'started',
          agentCount: analysisAgents.length,
        });
        let whiteboard: AnalysisEnvelope[];
        try {
          whiteboard = await this.dependencies.analyze({
            projectId: command.projectId,
            turnId,
            agents: analysisAgents,
            systemPrompt: context.project.systemPrompt,
            history,
            userMessage: input.userMessage,
            signal,
            memoryState: memory.enabled ? memory.state : undefined,
            onAgentProgress: (progress) => emit({
              type: 'chat.pipeline.agent', turnId, ...progress,
            }),
          });
        } catch (error) {
          if (!signal.aborted) {
            await emit({
              type: 'chat.pipeline.stage', turnId, stage: 'analysis', status: 'failed',
              elapsedMs: Math.round(performance.now() - analysisStartedAt),
            });
          }
          throw error;
        }
        await emit({
          type: 'chat.pipeline.stage', turnId, stage: 'analysis', status: 'completed',
          elapsedMs: Math.round(performance.now() - analysisStartedAt),
        });

        const narratorStartedAt = performance.now();
        await emit({ type: 'chat.pipeline.stage', turnId, stage: 'narrator', status: 'started' });
        try {
          narration = await this.dependencies.narrate({
            projectId: command.projectId,
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
            memoryContext: memory.enabled ? memoryContext(memory.state, narrator) : undefined,
            onDelta: (delta) => emit({ type: 'chat.message.delta', delta }),
          });
        } catch (error) {
          if (!signal.aborted) {
            await emit({
              type: 'chat.pipeline.stage', turnId, stage: 'narrator', status: 'failed',
              elapsedMs: Math.round(performance.now() - narratorStartedAt),
            });
          }
          throw error;
        }
        await emit({
          type: 'chat.pipeline.stage', turnId, stage: 'narrator', status: 'completed',
          elapsedMs: Math.round(performance.now() - narratorStartedAt),
        });
        outcome = { status: 'completed', content: narration.prose };
        memoryResult = await context.memory.process(command.projectId, input.branchId, memory, {
          turnId, systemPrompt: context.project.systemPrompt,
          agents: context.projectAgents, prose: narration.prose, signal,
        }, async (stage, status, elapsedMs) => {
          if (!signal.aborted) await emit({ type: 'chat.pipeline.stage', turnId, stage, status, elapsedMs });
        });
      } catch (error) {
        if (narration) {
          outcome = { status: 'completed', content: narration.prose };
          memoryResult = await context.memory.failed(turnId, input.branchId, error);
        } else outcome = { status: 'failed', error };
      }
      return this.finishTurn(context, turnId, input.branchId, outcome, memoryResult);
    });
  }

  async retryMemory(projectId: string, branchId: string, turnId: string,
    expected: z.infer<typeof memoryExpectedSchema>, signal: AbortSignal): Promise<MemoryResult> {
    return this.dependencies.withProjectTransaction(projectId, async (context) => {
      const branch = await context.branches.get(branchId);
      if (branch.headTurnId !== turnId || branch.headTurnId !== expected.expectedHeadTurnId) {
        throw new ApiError(409, 'CHAT_NOT_HEAD', 'Seule la mémoire du dernier tour peut être relancée.');
      }
      const turn = await context.turns.get(turnId);
      if (turn.status !== 'completed') throw new ApiError(409, 'CHAT_INVALID_TURN_STATE', 'Ce tour n’a pas de narration terminée.');
      const view = await context.memory.prepare(branchId, null);
      if (view.revisionId !== expected.expectedRevisionId || view.catalogRevisionId !== expected.expectedCatalogRevisionId) {
        throw new ApiError(409, 'MEMORY_CHANGED', 'La mémoire a changé. Rechargez avant de relancer.');
      }
      const source = await context.memory.source(turnId);
      const result = await context.memory.process(projectId, branchId, view, {
        turnId, systemPrompt: context.project.systemPrompt, agents: context.projectAgents,
        prose: source.narrator, signal,
      }, async () => {});
      await context.recordActivity(new Date());
      return result;
    });
  }

  private async finishTurn(
    context: ChatTransactionContext, turnId: string, branchId: string, outcome: GenerationOutcome, memory?: MemoryResult,
  ): Promise<ChatRunResult> {
    const at = new Date();
    const result: ChatRunResult = outcome.status === 'completed'
      ? { status: 'completed', turnId, branchId, message: await context.messages.createAssistant(outcome.content, at), memory }
      : { status: 'failed', turnId, branchId, error: outcome.error };
    await context.turns.finish(turnId, branchId, result, at);
    await context.branches.advance(branchId, turnId);
    await context.recordActivity(at);
    return result;
  }
}
