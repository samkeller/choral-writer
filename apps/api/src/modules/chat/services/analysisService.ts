import type { AnalysisEnvelope, ChatTurn, Message, ProjectAgent, MemoryState } from '@choral-writer/shared';
import { analysisEnvelopeSchema } from '@choral-writer/shared';
import { z } from 'zod';

import { ApiError } from '../../../errors/errors.js';
import type { CallLLMInput, createCallLLM } from '../../../llm/call-llm.js';
import { conversationMessages } from './conversationMessages.js';
import { formatMemoryContext, memoryContext } from '../../memories/services/memoryState.js';

type AnalysisAgent = ProjectAgent & { phase: 'analysis'; output: 'envelope' };

export function isAnalysisAgent(agent: ProjectAgent): agent is AnalysisAgent {
  return agent.phase === 'analysis' && agent.output === 'envelope';
}

export type AnalysisInput = {
  projectId: string;
  turnId: string;
  agents: readonly AnalysisAgent[];
  systemPrompt: string;
  history: readonly ChatTurn[];
  userMessage: Message;
  signal: AbortSignal;
  onAgentProgress?: (progress: AnalysisAgentProgress) => Promise<void>;
  memoryState?: MemoryState;
};

export type AnalysisAgentProgress = {
  agentId: string;
  name: string;
  status: 'started' | 'completed' | 'failed';
  durationMs?: number;
};

function analysisContract(agentName: string, itemBudget: number): string {
  return [
    'Return exactly one JSON object with this shape:',
    '{"v":1,"agent":"<your name>","summary":"<one sentence>","items":[{"kind":"<free-form string>","text":"<string>","importance":"LOW | NORMAL | HIGH"}]}',
    'Use LOW for secondary details, NORMAL for relevant information, and HIGH for information that materially changes the interpretation or action.',
    `Aim for at most ${itemBudget} items. This is an upper guideline, not a quota: return fewer items or none when appropriate.`,
    'Keep only distinct, actionable contributions within your specialty that can change the next scene or its interpretation. Do not restate the conversation or repeat the same point in different words.',
    'Prefer decisive constraints, risks and opportunities over exhaustive observations. Reserve HIGH for genuinely decisive information.',
    `Set "agent" to ${JSON.stringify(agentName)}. Use an empty items array when you have nothing to contribute.`,
  ].join('\n');
}

export class ChatAnalysisService {
  constructor(private readonly callLLM: ReturnType<typeof createCallLLM>) {}

  async generate(input: AnalysisInput): Promise<AnalysisEnvelope[]> {
    if (input.agents.length === 0) return [];
    const itemBudget = Math.max(3, Math.floor(12 / input.agents.length));
    const results = await Promise.allSettled(input.agents.map((agent) => this.generateForAgent(input, agent, itemBudget)));
    const errors = results.flatMap((result) => result.status === 'rejected' ? [result.reason] : []);
    const unexpectedErrors = errors.filter((error) =>
      !(error instanceof ApiError && error.options.source === 'llm'));
    if (unexpectedErrors.length > 0) {
      throw new AggregateError(unexpectedErrors, 'One or more analysis agents failed unexpectedly.');
    }
    return results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
  }

  private async generateForAgent(input: AnalysisInput, agent: AnalysisAgent, itemBudget: number): Promise<AnalysisEnvelope> {
    const startedAt = Date.now();
    await input.onAgentProgress?.({ agentId: agent.agentId, name: agent.name, status: 'started' });
    try {
      const memory = input.memoryState ? memoryContext(input.memoryState, agent) : { tags: [], entries: [] };
      const request: CallLLMInput<AnalysisEnvelope> = {
        projectId: input.projectId,
        turnId: input.turnId,
        agentId: agent.agentId,
        agentVersionId: agent.versionId,
        stage: 'analysis',
        memory,
        messages: conversationMessages(
          [input.systemPrompt, agent.instructions, analysisContract(agent.name, itemBudget),
            formatMemoryContext(memory)].filter(Boolean).join('\n\n'),
          input.history,
          input.userMessage,
        ),
        schema: analysisEnvelopeSchema.extend({ agent: z.literal(agent.name) }),
        signal: input.signal,
      };

      let parsed: AnalysisEnvelope;
      try {
        const result = await this.callLLM(request);
        if (!result.parsed) throw new Error('Analysis response was not validated.');
        parsed = result.parsed;
      } catch (error) {
        if (!(error instanceof ApiError)
          || !['LLM_INVALID_RESPONSE', 'LLM_EMPTY_RESPONSE'].includes(error.code)) throw error;
        const retry = await this.callLLM(request);
        if (!retry.parsed) throw new Error('Analysis retry response was not validated.');
        parsed = retry.parsed;
      }

      await input.onAgentProgress?.({
        agentId: agent.agentId, name: agent.name, status: 'completed', durationMs: Date.now() - startedAt,
      });
      return parsed;
    } catch (error) {
      await input.onAgentProgress?.({
        agentId: agent.agentId, name: agent.name, status: 'failed', durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  }
}
