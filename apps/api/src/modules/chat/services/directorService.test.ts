import { describe, expect, it } from 'vitest';
import type { ChatCompletion } from 'openai/resources/chat/completions';
import type { AnalysisEnvelope, TurnDirection } from '@choral-writer/shared';

import { createTestCallLLM } from '../../../tests/support/callLLM.js';
import { ChatDirectorService, type DirectorAgent, type DirectorInput } from './directorService.js';

function completion(content: string): ChatCompletion {
  return {
    id: 'test', object: 'chat.completion', created: 0, model: 'test-model',
    choices: [{
      index: 0, finish_reason: 'stop', logprobs: null,
      message: { role: 'assistant', content, refusal: null, annotations: [] },
    }],
  };
}

const agent: DirectorAgent = {
  agentId: 'director-id', versionId: 'director-version-id', phase: 'direction', output: 'direction',
  version: 1, name: 'Director', instructions: 'Director instructions.',
};

const whiteboard: AnalysisEnvelope[] = [
  {
    v: 1, agent: 'Chaos', summary: 'Chaos summary.',
    items: [
      { kind: 'observation', text: 'First item.', importance: 'HIGH' },
      { kind: 'idea', text: 'Second item.', importance: 'LOW' },
    ],
  },
  { v: 1, agent: 'Mara', summary: 'Mara summary.', items: [{ kind: 'refus', text: 'Third item.', importance: 'NORMAL' }] },
];

const validOutput = {
  v: 1,
  retained: [{ item: 'c1', why: 'Decisive.' }, { item: 'c3', why: 'Character authority.' }],
  dismissed: [{ item: 'c2', why: 'Redundant.' }],
  tension: 'monter',
  nudges: [{ type: 'pression', target: 'Her intention.', basis: 'c3' }],
};

function setup(responses: string[]) {
  const prompts: string[] = [];
  const { callLLM, traces } = createTestCallLLM({
    create: async (params) => {
      const system = params.messages[0]?.content;
      if (typeof system === 'string') prompts.push(system);
      const next = responses.shift();
      if (next === undefined) throw new Error('Unexpected call.');
      return completion(next);
    },
  });
  const input = (overrides: Partial<DirectorInput> = {}): DirectorInput => ({
    projectId: 'project', turnId: 'turn', agent, systemPrompt: 'Project prompt.', whiteboard, history: [],
    recentDirections: [],
    userMessage: { id: 'user', projectId: 'project', role: 'user', content: 'Open the door.', createdAt: new Date() },
    signal: new AbortController().signal,
    ...overrides,
  });
  return { service: new ChatDirectorService(callLLM), prompts, traces, input };
}

describe('ChatDirectorService', () => {
  it('shows developments with their scope, and what retaining or dismissing one means', async () => {
    const offscreen = {
      kind: 'development', characters: ['Le facteur'], scope: 'offscreen', text: 'Le facteur part.', importance: 'LOW',
    } as const;
    const { service, prompts, input } = setup([JSON.stringify({
      v: 1, retained: [], dismissed: [{ item: 'c1', why: 'Trop tôt.' }], tension: 'tenir', nudges: [],
    })]);

    const direction = await service.generate(input({
      whiteboard: [{ v: 1, agent: 'Absents', summary: 'Résumé.', items: [offscreen] }],
    }));

    expect(prompts[0]).toContain('- [c1] développement hors champ (personnages : Le facteur ; importance faible) : Le facteur part.');
    expect(prompts[0]).toContain('Écarté, il n’a pas lieu. Tu ne changes ni son texte ni sa portée.');
    expect(direction.dismissed).toEqual([{ agent: 'Absents', item: offscreen, why: 'Trop tôt.' }]);
  });

  it('rejects a nudge based on an off-screen development, which would carry it to the Narrator', async () => {
    const offscreen = {
      kind: 'development', characters: ['Le facteur'], scope: 'offscreen', text: 'Le facteur part.', importance: 'LOW',
    } as const;
    const invalid = JSON.stringify({
      v: 1, retained: [{ item: 'c1', why: 'Pression du monde.' }], dismissed: [], tension: 'monter',
      nudges: [{ type: 'pression', target: 'Le plan du facteur.', basis: 'c1' }],
    });
    const { service, traces, prompts, input } = setup([invalid, invalid]);

    await expect(service.generate(input({
      whiteboard: [{ v: 1, agent: 'Absents', summary: 'Résumé.', items: [offscreen] }],
    }))).rejects.toMatchObject({ code: 'LLM_INVALID_RESPONSE' });
    expect(traces.map((trace) => trace.status)).toEqual(['error', 'error']);
    expect(prompts[0]).toContain('Il ne s’appuie jamais sur un développement hors champ et ne le mentionne pas');
  });

  it('shows identified items and resolves the selection to verbatim contributions', async () => {
    const { service, prompts, traces, input } = setup([JSON.stringify(validOutput)]);

    const direction = await service.generate(input());

    expect(prompts[0]).toContain('Director instructions.');
    expect(prompts[0]).toContain('- [c1] observation (importance haute) : First item.');
    expect(prompts[0]).toContain('- [c3] refus (importance normale) : Third item.');
    expect(traces).toMatchObject([{ stage: 'direction', agentVersionId: 'director-version-id', status: 'success' }]);
    expect(direction).toEqual({
      tension: 'monter',
      nudges: [{ type: 'pression', target: 'Her intention.', basis: { agent: 'Mara', item: whiteboard[1]!.items[0] } }],
      retained: [
        { agent: 'Chaos', item: whiteboard[0]!.items[0], why: 'Decisive.' },
        { agent: 'Mara', item: whiteboard[1]!.items[0], why: 'Character authority.' },
      ],
      dismissed: [{ agent: 'Chaos', item: whiteboard[0]!.items[1], why: 'Redundant.' }],
    });
  });

  it.each([
    ['an item left unselected', { ...validOutput, dismissed: [] }],
    ['an item selected twice', { ...validOutput, dismissed: [{ item: 'c2', why: 'x' }, { item: 'c1', why: 'x' }] }],
    ['an unknown item', { ...validOutput, dismissed: [{ item: 'c2', why: 'x' }, { item: 'c9', why: 'x' }] }],
    ['an unknown basis', { ...validOutput, nudges: [{ type: 'pression', target: 'x', basis: 'c9' }] }],
    ['a basis on a dismissed item', { ...validOutput, nudges: [{ type: 'pression', target: 'x', basis: 'c2' }] }],
    ['two nudges of one type', { ...validOutput, nudges: [
      { type: 'retard', target: 'x', basis: null }, { type: 'retard', target: 'y', basis: null },
    ] }],
    ['three nudges', { ...validOutput, nudges: [
      { type: 'retard', target: 'x', basis: null }, { type: 'saillance', target: 'y', basis: null },
      { type: 'relance', target: 'z', basis: null },
    ] }],
    ['a removed nudge type', { ...validOutput, nudges: [{ type: 'evenement', target: 'x', basis: null }] }],
  ])('retries once, then rejects %s', async (_case, output) => {
    const invalid = JSON.stringify(output);
    const { service, traces, input } = setup([invalid, invalid]);

    await expect(service.generate(input())).rejects.toMatchObject({ code: 'LLM_INVALID_RESPONSE' });
    expect(traces.map((trace) => trace.status)).toEqual(['error', 'error']);
  });

  it('accepts a valid retry after an invalid output', async () => {
    const { service, traces, input } = setup(['not json', JSON.stringify(validOutput)]);

    await expect(service.generate(input())).resolves.toMatchObject({ tension: 'monter' });
    expect(traces.map((trace) => trace.status)).toEqual(['error', 'success']);
  });

  it('forbids the nudge types of the previous direction and shows recent directions', async () => {
    const previous: TurnDirection = {
      tension: 'tenir', nudges: [{ type: 'pression', target: 'Earlier pressure.', basis: null }],
      retained: [], dismissed: [],
    };
    const { service, prompts, input } = setup([JSON.stringify(validOutput), JSON.stringify(validOutput)]);

    await expect(service.generate(input({ recentDirections: [null, previous] })))
      .rejects.toMatchObject({ code: 'LLM_INVALID_RESPONSE' });
    expect(prompts[0]).toContain('Types interdits à ce tour, car employés au tour précédent : pression.');
    expect(prompts[0]).toContain('- aucune direction\n- tension « tenir » ; nudges : pression (Earlier pressure.)');
  });

  it('accepts an empty selection when the whiteboard has no contribution', async () => {
    const { service, prompts, input } = setup([JSON.stringify({
      v: 1, retained: [], dismissed: [], tension: 'relacher', nudges: [{ type: 'relance', target: 'x', basis: null }],
    })]);

    const direction = await service.generate(input({ whiteboard: [] }));

    expect(direction).toMatchObject({ tension: 'relacher', retained: [], dismissed: [] });
    expect(prompts[0]).toContain('Aucune contribution à ce tour');
  });
});
