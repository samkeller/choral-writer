import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { AnalysisEnvelope, ChatTurn, MemoryContext, Message, TurnDirection } from '@choral-writer/shared';

import type { CallLLMInput, LLMResult } from '../../../llm/call-llm.js';
import { ChatNarratorService } from './narratorService.js';
import type { NarratorInput } from '../types/narrator.types.js';

function message(id: string, role: Message['role'], content: string): Message {
  return { id, projectId: 'project', role, content, createdAt: new Date('2025-01-01T00:00:00.000Z') };
}

const observation = { kind: 'observation', text: 'Une porte grince.', importance: 'NORMAL' } as const;
const sceneDevelopment = {
  kind: 'development', characters: ['Personnage A'], scope: 'scene', text: 'La lampe s’éteint.', importance: 'HIGH',
} as const;
const offscreenDevelopment = {
  kind: 'development', characters: ['Personnage B'], scope: 'offscreen', text: 'Un départ générique.', importance: 'LOW',
} as const;

const whiteboard: AnalysisEnvelope[] = [
  { v: 1, agent: 'Monde', summary: 'Le soir tombe.', items: [observation, sceneDevelopment, offscreenDevelopment] },
  { v: 1, agent: 'Rythme', summary: 'Ralentir.', items: [{ kind: 'suggestion', text: 'Une pause.', importance: 'LOW' }] },
];

const direction: TurnDirection = {
  tension: 'monter',
  nudges: [{ type: 'complication', target: 'La tentative d’ouvrir.', basis: null }],
  retained: [
    { agent: 'Monde', item: observation, why: 'Concret.' },
    { agent: 'Monde', item: sceneDevelopment, why: 'Utile.' },
    { agent: 'Monde', item: offscreenDevelopment, why: 'Plus tard.' },
  ],
  dismissed: [{ agent: 'Rythme', item: whiteboard[1]!.items[0]!, why: 'Hors sujet.' }],
};

const memory: MemoryContext = {
  tags: [{ id: '019ad30c-19b0-7000-8000-000000000801', name: 'Faits', description: 'Faits établis.' }],
  entries: [{
    id: '019ad30c-19b0-7000-8000-000000000802', key: 'Lieu', content: 'Une maison fictive.',
    tagIds: ['019ad30c-19b0-7000-8000-000000000801'],
  }],
};

const history: ChatTurn[] = [{
  id: '019ad30c-19b0-7000-8000-000000000803', parentTurnId: null, originBranchId: '019ad30c-19b0-7000-8000-000000000804',
  retryOfTurnId: null, regeneratedFromTurnId: null, status: 'completed', error: null,
  userMessage: message('u1', 'user', 'Saisie précédente.'),
  assistantMessage: message('a1', 'assistant', 'Prose précédente.'),
}];

/**
 * Fingerprint of the messages sent to the provider. The expected values were computed on 4e649cf,
 * before the prompts were split into measured sections: they guard the prompt against any drift.
 */
function fingerprint(messages: readonly ChatCompletionMessageParam[]): string {
  return createHash('sha256').update(JSON.stringify(messages)).digest('hex');
}

async function narratorMessages(overrides: Partial<NarratorInput>): Promise<ChatCompletionMessageParam[]> {
  let sent: ChatCompletionMessageParam[] = [];
  const service = new ChatNarratorService(async <T,>(input: CallLLMInput<T>): Promise<LLMResult<T>> => {
    sent = input.messages;
    return { callId: 'call', content: 'Prose.', inputTokens: null, outputTokens: null, durationMs: 0 };
  });
  await service.generate({
    projectId: 'project', turnId: 'turn', agentId: 'narrator', agentVersionId: 'narrator-version',
    systemPrompt: 'Prompt fictif du projet.', instructions: 'Écris au présent.',
    whiteboard, direction: null, history, userMessage: message('u2', 'user', 'Nouvelle saisie.'),
    signal: new AbortController().signal, onDelta: async () => {}, memoryContext: memory,
    ...overrides,
  });
  return sent;
}

describe('ChatNarratorService prompt', () => {
  it('sends the same messages as before the composition was measured, with the whole whiteboard', async () => {
    expect(fingerprint(await narratorMessages({}))).toBe('3c3396959ddc98fb20c607cb3a577e65c7b032a90425e2cd4aa6d925388ada00');
  });

  it('sends the same messages as before the composition was measured, with a direction', async () => {
    expect(fingerprint(await narratorMessages({ direction }))).toBe('5149e41035bcc580664f64e6f1727943aa466ce529b03539fe3b5c958cb004fb');
  });
});
