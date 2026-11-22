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
    'Renvoie exactement un objet JSON de cette forme :',
    '{"v":1,"agent":"<ton nom>","summary":"<une phrase>","items":[<item>]}',
    'Chaque item est soit une perspective, soit un développement :',
    '- perspective (avis, suggestion, risque, contrainte…) : {"kind":"<type libre, jamais development>","text":"<texte>","importance":"LOW | NORMAL | HIGH"}',
    '- développement, c’est-à-dire ce qui arrive dans le monde du récit à ce tour : {"kind":"development","characters":["<personnage concerné>"],"scope":"scene | offscreen","text":"<une phrase factuelle>","importance":"LOW | NORMAL | HIGH"}',
    'Un développement est un fait, pas une suggestion : son texte dit ce qui arrive, en une phrase, sans prose ni réplique. "scope" vaut "scene" s’il arrive dans la scène en cours, "offscreen" s’il arrive hors champ ; un développement hors champ a lieu même si le récit ne le raconte pas. Un développement ne décide jamais de ce que fait ou dit le personnage joué par l’utilisateur.',
    'Le "summary" ne révèle aucun développement hors champ.',
    'Utilise LOW pour les détails secondaires, NORMAL pour les informations pertinentes et HIGH pour ce qui change nettement l’interprétation ou l’action.',
    `Vise au plus ${itemBudget} items. C’est un plafond indicatif, pas un quota : renvoie moins d’items, voire aucun, quand c’est approprié.`,
    'Ne garde que des contributions distinctes et exploitables, dans ta spécialité, qui peuvent changer la scène suivante ou son interprétation. Ne reformule pas la conversation et ne répète pas un même point en d’autres mots.',
    'Préfère les contraintes, risques et occasions décisifs aux observations exhaustives. Réserve HIGH aux informations vraiment décisives.',
    `Donne à "agent" la valeur ${JSON.stringify(agentName)}. Renvoie un tableau "items" vide quand tu n’as rien à apporter.`,
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
