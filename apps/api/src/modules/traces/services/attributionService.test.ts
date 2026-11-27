import { describe, expect, it } from 'vitest';
import type { ChatCompletion } from 'openai/resources/chat/completions';
import type { TurnAttribution, TurnDirection, TurnTraceSummary } from '@choral-writer/shared';

import { createTestCallLLM } from '../../../tests/support/callLLM.js';
import { AttributionService } from './attributionService.js';

function completion(content: string): ChatCompletion {
  return {
    id: 'test', object: 'chat.completion', created: 0, model: 'test-model',
    choices: [{
      index: 0, finish_reason: 'stop', logprobs: null,
      message: { role: 'assistant', content, refusal: null, annotations: [] },
    }],
  };
}

const scene = { kind: 'observation', text: 'Un fil est visible.', importance: 'HIGH' as const };
const idea = { kind: 'idee', text: 'Une porte grince.', importance: 'LOW' as const };
const offscreen = {
  kind: 'development' as const, characters: ['Personnage B'], scope: 'offscreen' as const,
  text: 'Un départ générique.', importance: 'NORMAL' as const,
};

function summary(direction: TurnDirection | null, prose: string | null = 'Une prose fictive.'): TurnTraceSummary {
  return {
    turnId: 'turn',
    analysis: [{
      agentId: null, agentVersionId: null, name: 'Chaos', status: 'success', durationMs: 1, attempts: 1,
      envelope: { v: 1, agent: 'Chaos', summary: 'Résumé.', items: [scene, idea, offscreen] },
    }],
    direction: direction && {
      agentId: null, agentVersionId: null, name: 'Directeur', status: 'success', durationMs: 1, attempts: 1,
      cost: { microUsd: 0, complete: true }, direction,
    },
    developments: null,
    narrator: { status: prose ? 'success' : 'error', durationMs: 1, prose },
    calls: [], timeline: [], durationMs: 0, cost: { microUsd: 0, complete: true }, configuration: null,
  };
}

const direction: TurnDirection = {
  tension: 'tenir', nudges: [],
  retained: [{ agent: 'Chaos', item: scene, why: 'Concret.' }, { agent: 'Chaos', item: offscreen, why: 'Le monde avance.' }],
  dismissed: [{ agent: 'Chaos', item: idea, why: 'Redondant.' }],
};

const oneVerdict = JSON.stringify({
  whatHappened: 'Le protagoniste remarque le fil.',
  contributions: [{ id: 1, verdict: 'retenu', note: 'premier paragraphe' }],
});

function setup(responses: string[], turn = summary(direction)) {
  const prompts: string[] = [];
  const { callLLM, traces } = createTestCallLLM({
    create: async (params) => {
      prompts.push(params.messages.map((message) => String(message.content)).join('\n'));
      const next = responses.shift();
      if (next === undefined) throw new Error('Unexpected call.');
      return completion(next);
    },
  });
  let stored: TurnAttribution | null = null;
  const repository = {
    find: async () => stored,
    save: async (_projectId: string, _turnId: string, attribution: TurnAttribution) => { stored = attribution; },
    listCallCosts: async () => traces.map(() => ({ costMicroUsd: 10 })),
  };
  const service = new AttributionService(callLLM, repository, async () => turn);
  return { service, prompts, traces, stored: () => stored };
}

describe('AttributionService', () => {
  it('reads the prose against what the Narrator received, traced as an attribution call', async () => {
    const { service, prompts, traces } = setup([oneVerdict]);

    const response = await service.forTurn('project', 'turn', { regenerate: false });

    expect(response.attribution).toMatchObject({
      whatHappened: 'Le protagoniste remarque le fil.',
      contributions: [{ agent: 'Chaos', item: scene, verdict: 'retenu', note: 'premier paragraphe' }],
      callId: traces[0]?.id,
    });
    expect(response.cost).toEqual({ microUsd: 10, complete: true, calls: 1 });
    expect(traces).toMatchObject([{ stage: 'attribution', turnId: 'turn', projectId: 'project', status: 'success' }]);
    // Only what the Narrator read: neither the dismissed idea nor the off-screen development.
    expect(prompts[0]).toContain('1. [Chaos] observation');
    expect(prompts[0]).not.toContain(idea.text);
    expect(prompts[0]).not.toContain(offscreen.text);
  });

  it('reads the whole whiteboard, off-screen aside, when the turn ran without a direction', async () => {
    const twoVerdicts = JSON.stringify({
      whatHappened: 'Rien de notable.',
      contributions: [{ id: 2, verdict: 'absent', note: '' }, { id: 1, verdict: 'partiel', note: 'évoqué' }],
    });
    const { service } = setup([twoVerdicts], summary(null));

    const { attribution } = await service.forTurn('project', 'turn', { regenerate: false });

    expect(attribution.contributions.map(({ item, verdict }) => [item.text, verdict])).toEqual([
      [scene.text, 'partiel'], [idea.text, 'absent'],
    ]);
  });

  it('serves the cached attribution without a new call, and recomputes only when asked', async () => {
    const regenerated = JSON.stringify({
      whatHappened: 'Une autre lecture.', contributions: [{ id: 1, verdict: 'partiel', note: 'à la fin' }],
    });
    const { service, traces } = setup([oneVerdict, regenerated]);

    const first = await service.forTurn('project', 'turn', { regenerate: false });
    const cached = await service.forTurn('project', 'turn', { regenerate: false });
    expect(cached.attribution).toEqual(first.attribution);
    expect(traces).toHaveLength(1);

    const again = await service.forTurn('project', 'turn', { regenerate: true });
    expect(again.attribution.whatHappened).toBe('Une autre lecture.');
    expect(again.cost.calls).toBe(2);
  });

  it('pays once when the turn is opened twice at the same time', async () => {
    const { service, traces } = setup([oneVerdict]);

    const [first, second] = await Promise.all([
      service.forTurn('project', 'turn', { regenerate: false }),
      service.forTurn('project', 'turn', { regenerate: false }),
    ]);

    expect(second.attribution).toEqual(first.attribution);
    expect(traces).toHaveLength(1);
  });

  it('fails openly on an invalid output, caches nothing, and can be retried', async () => {
    const missingVerdict = JSON.stringify({ whatHappened: 'Incomplet.', contributions: [] });
    const { service, traces, stored } = setup([missingVerdict, oneVerdict]);

    await expect(service.forTurn('project', 'turn', { regenerate: false }))
      .rejects.toMatchObject({ code: 'LLM_INVALID_RESPONSE' });
    expect(stored()).toBeNull();
    expect(traces).toMatchObject([{ stage: 'attribution', status: 'error' }]);

    const retried = await service.forTurn('project', 'turn', { regenerate: false });
    expect(retried.attribution.contributions[0]?.verdict).toBe('retenu');
    expect(retried.cost.calls).toBe(2);
  });

  it('refuses a turn without prose, without calling the model', async () => {
    const { service, traces } = setup([], summary(direction, null));

    await expect(service.forTurn('project', 'turn', { regenerate: false }))
      .rejects.toMatchObject({ code: 'ATTRIBUTION_UNAVAILABLE', statusCode: 409 });
    expect(traces).toHaveLength(0);
  });
});
