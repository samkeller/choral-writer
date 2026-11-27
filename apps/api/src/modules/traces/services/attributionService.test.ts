import { describe, expect, it } from 'vitest';
import type { ChatCompletion } from 'openai/resources/chat/completions';
import type { TurnAttributionRecord, TurnDirection, TurnTraceSummary } from '@choral-writer/shared';

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

/** Valid JSON, but a verdict short: the model may fix it on a second try. */
const invalid = JSON.stringify({ whatHappened: 'Incomplet.', contributions: [] });

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
  let stored: TurnAttributionRecord | null = null;
  const repository = {
    find: async () => stored,
    save: async (_projectId: string, _turnId: string, record: TurnAttributionRecord) => { stored = record; },
    listCallCosts: async () => traces.map(() => ({ costMicroUsd: 10 })),
  };
  const service = new AttributionService(callLLM, repository, async () => turn);
  return { service, prompts, traces, stored: () => stored };
}

describe('AttributionService', () => {
  it('reads the prose against what the Narrator received, traced as an attribution call', async () => {
    const { service, prompts, traces } = setup([oneVerdict]);

    const response = await service.forTurn('project', 'turn', { regenerate: false });

    expect(response.failure).toBeNull();
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

  it('reads the whole whiteboard, off-screen aside, without a direction, and tolerates loose identifiers and notes', async () => {
    const loose = JSON.stringify({
      whatHappened: 'Rien de notable.',
      contributions: [{ id: '2', verdict: 'absent' }, { id: 1, verdict: 'partiel', note: 'évoqué' }],
    });
    const { service } = setup([loose], summary(null));

    const { attribution } = await service.forTurn('project', 'turn', { regenerate: false });

    expect(attribution?.contributions.map(({ item, verdict, note }) => [item.text, verdict, note])).toEqual([
      [scene.text, 'partiel', 'évoqué'], [idea.text, 'absent', ''],
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
    expect(again.attribution?.whatHappened).toBe('Une autre lecture.');
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

  it('does not pay again when another request cached the attribution after this one read the cache', async () => {
    const { callLLM, traces } = createTestCallLLM({ create: async () => { throw new Error('Unexpected call.'); } });
    const record: TurnAttributionRecord = {
      attribution: {
        whatHappened: 'Déjà lu.', contributions: [], callId: '019ad30c-19b0-7000-8000-000000000901',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
      failure: null,
    };
    const reads: (TurnAttributionRecord | null)[] = [null, record];
    const service = new AttributionService(callLLM, {
      find: async () => (reads.length ? reads.shift()! : record), save: async () => {}, listCallCosts: async () => [],
    }, async () => summary(direction));

    expect((await service.forTurn('project', 'turn', { regenerate: false })).attribution).toEqual(record.attribution);
    expect(traces).toHaveLength(0);
  });

  it('retries an invalid output once before reporting it', async () => {
    const { service, traces } = setup([invalid, oneVerdict]);

    const response = await service.forTurn('project', 'turn', { regenerate: false });

    expect(response.attribution?.contributions[0]?.verdict).toBe('retenu');
    expect(traces.map((trace) => trace.status)).toEqual(['error', 'success']);
    expect(response.cost.calls).toBe(2);
  });

  it('caches a failure with its cost, shows it again without paying, and recomputes only on request', async () => {
    const { service, traces, stored } = setup([invalid, invalid, oneVerdict]);

    const failed = await service.forTurn('project', 'turn', { regenerate: false });
    expect(failed.attribution).toBeNull();
    expect(failed.failure).toMatchObject({ code: 'LLM_INVALID_RESPONSE' });
    expect(failed.cost).toEqual({ microUsd: 20, complete: true, calls: 2 });
    expect(stored()?.failure).toEqual(failed.failure);

    const reopened = await service.forTurn('project', 'turn', { regenerate: false });
    expect(reopened.failure).toEqual(failed.failure);
    expect(traces).toHaveLength(2);

    const retried = await service.forTurn('project', 'turn', { regenerate: true });
    expect(retried.failure).toBeNull();
    expect(retried.attribution?.contributions[0]?.verdict).toBe('retenu');
  });

  it('keeps the previous attribution when a regeneration fails', async () => {
    const { service } = setup([oneVerdict, invalid, invalid]);

    const first = await service.forTurn('project', 'turn', { regenerate: false });
    const failed = await service.forTurn('project', 'turn', { regenerate: true });

    expect(failed.attribution).toEqual(first.attribution);
    expect(failed.failure).toMatchObject({ code: 'LLM_INVALID_RESPONSE' });
  });

  it('refuses a turn without prose, without calling the model', async () => {
    const { service, traces } = setup([], summary(direction, null));

    await expect(service.forTurn('project', 'turn', { regenerate: false }))
      .rejects.toMatchObject({ code: 'ATTRIBUTION_UNAVAILABLE', statusCode: 409 });
    expect(traces).toHaveLength(0);
  });
});
