import type { AnalysisEnvelope, ChatTurn, Message, ProjectAgent } from '@choral-writer/shared';
import { analysisEnvelopeSchema } from '@choral-writer/shared';
import { z } from 'zod';

import { ApiError } from '../../../errors/errors.js';
import type { CallLLMInput, createCallLLM } from '../../../llm/call-llm.js';
import { conversationMessages } from './conversationMessages.js';

type AnalysisAgent = ProjectAgent & { phase: 'analysis'; output: 'envelope' };

export function isAnalysisAgent(agent: ProjectAgent): agent is AnalysisAgent {
  return agent.phase === 'analysis' && agent.output === 'envelope';
}

export type AnalysisInput = {
  turnId: string;
  agents: readonly AnalysisAgent[];
  systemPrompt: string;
  history: readonly ChatTurn[];
  userMessage: Message;
  signal: AbortSignal;
};

function analysisContract(agentName: string): string {
  return [
    'Return exactly one JSON object with this shape:',
    '{"v":1,"agent":"<your name>","summary":"<one sentence>","items":[{"kind":"<free-form string>","text":"<string>","importance":"LOW | NORMAL | HIGH"}]}',
    'Use LOW for secondary details, NORMAL for relevant information, and HIGH for information that materially changes the interpretation or action.',
    `Set "agent" to ${JSON.stringify(agentName)}. Use an empty items array when you have nothing to contribute.`,
  ].join('\n');
}

export class ChatAnalysisService {
  constructor(private readonly callLLM: ReturnType<typeof createCallLLM>) {}

  async generate(input: AnalysisInput): Promise<AnalysisEnvelope[]> {
    const results = await Promise.allSettled(input.agents.map((agent) => this.generateForAgent(input, agent)));
    const errors = results.flatMap((result) => result.status === 'rejected' ? [result.reason] : []);
    if (errors.length > 0) {
      throw new AggregateError(errors, 'One or more analysis agents failed.');
    }
    return results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
  }

  private async generateForAgent(input: AnalysisInput, agent: AnalysisAgent): Promise<AnalysisEnvelope> {
    const messages = conversationMessages(
      [input.systemPrompt, agent.instructions, analysisContract(agent.name)].filter(Boolean).join('\n\n'),
      input.history,
      input.userMessage,
    );
    const request: CallLLMInput<AnalysisEnvelope> = {
      turnId: input.turnId,
      agentId: agent.agentId,
      agentVersionId: agent.versionId,
      stage: 'analysis',
      messages,
      schema: analysisEnvelopeSchema.extend({ agent: z.literal(agent.name) }),
      signal: input.signal,
    };

    try {
      const result = await this.callLLM(request);
      if (!result.parsed) throw new Error('Analysis response was not validated.');
      return result.parsed;
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== 'LLM_INVALID_RESPONSE') throw error;
    }

    const retry = await this.callLLM(request);
    if (!retry.parsed) throw new Error('Analysis retry response was not validated.');
    return retry.parsed;
  }
}
