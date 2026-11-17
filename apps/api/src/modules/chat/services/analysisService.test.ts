import { describe, expect, it, vi } from 'vitest';
import type {
  ChatCompletion, ChatCompletionCreateParamsNonStreaming, ChatCompletionCreateParamsStreaming,
} from 'openai/resources/chat/completions';
import type { ProjectAgent } from '@choral-writer/shared';

import type { LlmCallTrace } from '../../../llm/call-llm.js';
import { createCallLLM } from '../../../llm/call-llm.js';
import { ChatAnalysisService } from './analysisService.js';

function completion(content: string): ChatCompletion {
  return {
    id: 'test',
    object: 'chat.completion',
    created: 0,
    model: 'test-model',
    choices: [{
      index: 0,
      finish_reason: 'stop',
      logprobs: null,
      message: { role: 'assistant', content, refusal: null, annotations: [] },
    }],
  };
}

function agent(name: string): ProjectAgent & { phase: 'analysis'; output: 'envelope' } {
  return {
    agentId: `${name}-id`,
    versionId: `${name}-version-id`,
    phase: 'analysis',
    output: 'envelope',
    version: 1,
    name,
    instructions: `Instructions for ${name}.`,
  };
}

function setup(create: (
  params: ChatCompletionCreateParamsNonStreaming | ChatCompletionCreateParamsStreaming,
) => Promise<ChatCompletion>) {
  const traces: LlmCallTrace[] = [];
  const callLLM = createCallLLM({
    client: { chat: { completions: { create: async (params) => create(params) } } },
    traces: { insert: async (trace) => { traces.push(trace); } },
    model: 'test-model',
  });
  return { service: new ChatAnalysisService(callLLM), traces };
}

describe('ChatAnalysisService', () => {
  it.each([
    { agentCount: 1, itemBudget: 12 },
    { agentCount: 4, itemBudget: 3 },
    { agentCount: 6, itemBudget: 3 },
  ])('adapts the advisory item budget for $agentCount agents without truncating valid output', async ({ agentCount, itemBudget }) => {
    const requests: string[] = [];
    const agents = Array.from({ length: agentCount }, (_, index) => agent(`Analyst ${index}`));
    const { service } = setup(async (params) => {
      const prompt = params.messages[0]?.content;
      if (typeof prompt !== 'string') throw new Error('Expected analysis instructions.');
      requests.push(prompt);
      const currentAgent = agents.find((entry) => prompt.includes(entry.instructions));
      if (!currentAgent) throw new Error('Expected isolated agent instructions.');
      return completion(JSON.stringify({
        v: 1, agent: currentAgent.name, summary: 'Distinct contributions.',
        items: Array.from({ length: itemBudget + 1 }, (_, index) => ({
          kind: 'observation', text: `Contribution ${index}.`, importance: 'NORMAL',
        })),
      }));
    });

    const result = await service.generate({
      turnId: 'turn', agents, systemPrompt: 'Project prompt.', history: [],
      userMessage: {
        id: 'user', projectId: 'project', role: 'user', content: 'Open the door.', createdAt: new Date(),
      },
      signal: new AbortController().signal,
    });

    expect(requests).toHaveLength(agentCount);
    for (const prompt of requests) {
      expect(prompt).toContain(`Aim for at most ${itemBudget} items.`);
      expect(prompt).toContain('not a quota: return fewer items or none');
      expect(prompt).toContain('Do not restate the conversation');
    }
    expect(result).toHaveLength(agentCount);
    expect(result.every((entry) => entry.items.length === itemBudget + 1)).toBe(true);
  });

  it('runs configured agents in parallel with isolated instructions and versioned traces', async () => {
    let active = 0;
    let peak = 0;
    let release!: () => void;
    const bothStarted = new Promise<void>((resolve) => { release = resolve; });
    const { service, traces } = setup(async (params) => {
      active += 1;
      peak = Math.max(peak, active);
      if (active === 2) release();
      await bothStarted;
      const systemPrompt = params.messages[0]?.content;
      const name = typeof systemPrompt === 'string' && systemPrompt.includes('Instructions for Chaos.')
        ? 'Chaos' : 'Coherence';
      active -= 1;
      return completion(JSON.stringify({
        v: 1, agent: name, summary: `${name} summary.`,
        items: [{ kind: 'new-kind', text: `${name} fact.`, importance: 'HIGH' }],
      }));
    });

    const progress: Array<{ agentId: string; status: string }> = [];
    const result = await service.generate({
      turnId: 'turn',
      agents: [agent('Chaos'), agent('Coherence')],
      systemPrompt: 'Project prompt.',
      history: [],
      userMessage: {
        id: 'user', projectId: 'project', role: 'user', content: 'Open the door.', createdAt: new Date(),
      },
      signal: new AbortController().signal,
      onAgentProgress: async ({ agentId, status }) => { progress.push({ agentId, status }); },
    });

    expect(peak).toBe(2);
    expect(result.map((entry) => entry.agent)).toEqual(['Chaos', 'Coherence']);
    expect(traces).toHaveLength(2);
    expect(traces.map(({ agentId, agentVersionId, stage }) => ({ agentId, agentVersionId, stage }))
      .sort((left, right) => String(left.agentId).localeCompare(String(right.agentId)))).toEqual([
      { agentId: 'Chaos-id', agentVersionId: 'Chaos-version-id', stage: 'analysis' },
      { agentId: 'Coherence-id', agentVersionId: 'Coherence-version-id', stage: 'analysis' },
      ].sort((left, right) => left.agentId.localeCompare(right.agentId)));
    expect(progress).toHaveLength(4);
    for (const name of ['Chaos', 'Coherence']) {
      expect(progress.filter((event) => event.agentId === `${name}-id`).map((event) => event.status))
        .toEqual(['started', 'completed']);
    }
  });

  it('retries an invalid envelope exactly once', async () => {
    const responses = [JSON.stringify({
      v: 1, agent: 'Chaos', summary: 'Invalid importance.', items: [
        { kind: 'observation', text: 'A wire is visible.', importance: 'CRITICAL' },
      ],
    }), JSON.stringify({
      v: 1, agent: 'Chaos', summary: 'Validated.', items: [
        { kind: 'observation', text: 'A wire is visible.', importance: 'HIGH' },
      ],
    })];
    let calls = 0;
    const { service, traces } = setup(async () => completion(responses[calls++]!));

    const result = await service.generate({
      turnId: 'turn',
      agents: [agent('Chaos')],
      systemPrompt: 'Project prompt.',
      history: [],
      userMessage: {
        id: 'user', projectId: 'project', role: 'user', content: 'Open the door.', createdAt: new Date(),
      },
      signal: new AbortController().signal,
    });

    expect(calls).toBe(2);
    expect(result[0]?.summary).toBe('Validated.');
    expect(traces.map((trace) => trace.status)).toEqual(['error', 'success']);
  });

  it('retries an empty response once and continues with successful analysis agents', async () => {
    let chaosCalls = 0;
    const { service, traces } = setup(async (params) => {
      const systemPrompt = params.messages[0]?.content;
      if (typeof systemPrompt === 'string' && systemPrompt.includes('Instructions for Chaos.')) {
        chaosCalls += 1;
        return completion('');
      }
      return completion(JSON.stringify({ v: 1, agent: 'Coherence', summary: 'Valid.', items: [] }));
    });

    const progress: Array<{ agentId: string; status: string }> = [];
    await expect(service.generate({
      turnId: 'turn',
      agents: [agent('Chaos'), agent('Coherence')],
      systemPrompt: 'Project prompt.',
      history: [],
      userMessage: {
        id: 'user', projectId: 'project', role: 'user', content: 'Open the door.', createdAt: new Date(),
      },
      signal: new AbortController().signal,
      onAgentProgress: async ({ agentId, status }) => { progress.push({ agentId, status }); },
    })).resolves.toEqual([{
      v: 1, agent: 'Coherence', summary: 'Valid.', items: [],
    }]);

    expect(chaosCalls).toBe(2);
    expect(traces.filter((trace) => trace.agentId === 'Chaos-id').map((trace) => trace.status))
      .toEqual(['error', 'error']);
    expect(traces.filter((trace) => trace.agentId === 'Coherence-id')).toHaveLength(1);
    expect(progress.filter((event) => event.agentId === 'Chaos-id').map((event) => event.status))
      .toEqual(['started', 'failed']);
    expect(progress.filter((event) => event.agentId === 'Coherence-id').map((event) => event.status))
      .toEqual(['started', 'completed']);
  });

  it('skips analysis cleanly when no analysis agents are configured', async () => {
    const create = vi.fn(async () => completion('unused'));
    const { service } = setup(create);

    await expect(service.generate({
      turnId: 'turn', agents: [], systemPrompt: 'Project prompt.', history: [],
      userMessage: {
        id: 'user', projectId: 'project', role: 'user', content: 'Open the door.', createdAt: new Date(),
      },
      signal: new AbortController().signal,
    })).resolves.toEqual([]);

    expect(create).not.toHaveBeenCalled();
  });
});
