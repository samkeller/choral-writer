import type {
  ChatCompletion, ChatCompletionChunk, ChatCompletionCreateParamsNonStreaming, ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import { CONTEXT_CHARS_PER_TOKEN, type MemoryTag } from '@choral-writer/shared';

import type { ProviderStrategy } from '../llm/providers/index.js';
import { readNumber, readObject, unavailableBalance } from '../llm/providers/index.js';
import { JUDGE_CRITERIA, JUDGE_ROLE } from './blindJudge.js';

/**
 * Fournisseur simulé de l'évaluation : il répond à chaque étape du pipeline sans aucun appel réseau, avec
 * des sorties valides de taille réaliste, pour éprouver le script et estimer les tokens d'entrée. Il
 * reconnaît l'étape aux consignes fixes du pipeline ; un appel non reconnu échoue bruyamment.
 */

export const SIMULATED_MODEL = 'simulé';

/** Reads standard token counts; the simulated model has no price, so its calls stay unpriced. */
export const simulatedProvider: ProviderStrategy = {
  name: 'deepseek',
  extractUsage(raw: unknown) {
    const usage = readObject(readObject(raw)?.usage);
    return {
      inputTokens: readNumber(usage?.prompt_tokens),
      outputTokens: readNumber(usage?.completion_tokens),
      cachedInputTokens: null,
    };
  },
  providerCostUsd: () => null,
  priceWindow: () => 'all',
  balance: async () => unavailableBalance('deepseek', 'Fournisseur simulé.'),
};

const FILLER_SENTENCE = 'Le vent passait sur les vergers et la journée suivait son cours sans bruit.';

/** Neutral text of about `words` words: the simulation never writes a story. */
export function fillerText(words: number): string {
  const sentenceWords = FILLER_SENTENCE.split(' ').length;
  return Array.from({ length: Math.max(1, Math.ceil(words / sentenceWords)) }, () => FILLER_SENTENCE).join(' ');
}

const tokens = (text: string) => Math.ceil(text.length / CONTEXT_CHARS_PER_TOKEN);

function text(message: ChatCompletionMessageParam | undefined): string {
  return typeof message?.content === 'string' ? message.content : '';
}

function analysisOutput(system: string): string | null {
  const name = /Donne à "agent" la valeur ("(?:[^"\\]|\\.)*")/.exec(system)?.[1];
  if (!name) return null;
  const agent = JSON.parse(name) as string;
  return JSON.stringify({
    v: 1, agent, summary: 'Analyse simulée.', items: [
      { kind: 'observation', text: fillerText(30), importance: 'NORMAL' },
      {
        kind: 'development', characters: ['Personnage simulé'], scope: /hors champ/i.test(agent) ? 'offscreen' : 'scene',
        text: fillerText(20), importance: 'NORMAL',
      },
    ],
  });
}

/** Retains every contribution it was shown, without nudges, so no type can repeat. */
function directionOutput(system: string): string {
  const ids = [...system.matchAll(/^- \[(c\d+)\]/gm)].map((match) => match[1]);
  return JSON.stringify({
    v: 1, retained: ids.map((item) => ({ item, why: 'Retenu par la simulation.' })), dismissed: [],
    tension: 'tenir', nudges: [],
  });
}

/** One new entry per starting tag the Guardian usually feeds, so memory grows along the story. */
function guardianOutput(user: string, turn: number): string {
  const sources = JSON.parse(user.split('\n\n')[1] ?? '{}') as { tags?: MemoryTag[] };
  const proposals = (sources.tags ?? []).filter((tag) => ['Faits', 'Intentions', 'Fils ouverts'].includes(tag.name))
    .map((tag) => ({
      op: 'create', key: `simulation/${tag.name}/${turn}`, content: fillerText(60), tagIds: [tag.id],
      reason: 'Proposition simulée.',
    }));
  return JSON.stringify({ v: 2, proposals, tagSuggestions: [] });
}

/** Always prefers version A: swapping the order then shows the position bias the second pass detects. */
function judgeOutput(): string {
  return JSON.stringify({
    v: 1,
    criteria: Object.fromEntries(JUDGE_CRITERIA.map(({ key }) => [key, { winner: 'A', why: 'Verdict simulé.' }])),
  });
}

function completion(content: string, promptTokens: number): ChatCompletion {
  return {
    id: 'simulated', object: 'chat.completion', created: 0, model: SIMULATED_MODEL,
    choices: [{
      index: 0, finish_reason: 'stop', logprobs: null,
      message: { role: 'assistant', content, refusal: null, annotations: [] },
    }],
    usage: { prompt_tokens: promptTokens, completion_tokens: tokens(content), total_tokens: promptTokens + tokens(content) },
  };
}

async function* stream(content: string, promptTokens: number): AsyncGenerator<ChatCompletionChunk> {
  const base = { id: 'simulated', object: 'chat.completion.chunk' as const, created: 0, model: SIMULATED_MODEL };
  for (const piece of content.match(/[\s\S]{1,400}/g) ?? []) {
    yield { ...base, choices: [{ index: 0, delta: { content: piece }, finish_reason: null }] };
  }
  yield {
    ...base, choices: [{ index: 0, delta: { content: '' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: promptTokens, completion_tokens: tokens(content), total_tokens: promptTokens + tokens(content) },
  };
}

/** A client whose Narrator writes about `proseWords` words per turn. */
export function createSimulatedClient({ proseWords }: { proseWords: number }) {
  let guardianCalls = 0;
  return {
    chat: {
      completions: {
        async create(params: ChatCompletionCreateParamsNonStreaming | ChatCompletionCreateParamsStreaming):
          Promise<ChatCompletion | AsyncIterable<ChatCompletionChunk>> {
          const promptTokens = tokens(params.messages.map(text).join('\n'));
          if (params.stream) return stream(fillerText(proseWords), promptTokens);
          const system = text(params.messages[0]);
          const content = system.startsWith(JUDGE_ROLE) ? judgeOutput()
            : system.includes('Tu diriges ce tour') ? directionOutput(system)
              : system.includes('Tiens la mémoire à jour') ? guardianOutput(text(params.messages[1]), ++guardianCalls)
                : analysisOutput(system);
          if (content === null) throw new Error('Simulated provider: unrecognized call.');
          return completion(content, promptTokens);
        },
      },
    },
  };
}
