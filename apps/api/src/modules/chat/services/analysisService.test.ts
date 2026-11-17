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

    const result = await service.generate({
      turnId: 'turn',
      agents: [agent('Chaos'), agent('Coherence')],
      systemPrompt: 'Project prompt.',
      history: [],
      userMessage: {
        id: 'user', projectId: 'project', role: 'user', content: 'Open the door.', createdAt: new Date(),
      },
      signal: new AbortController().signal,
    });

    expect(peak).toBe(2);
    expect(result.map((entry) => entry.agent)).toEqual(['Chaos', 'Coherence']);
    expect(traces).toHaveLength(2);
    expect(traces.map(({ agentId, agentVersionId, stage }) => ({ agentId, agentVersionId, stage }))
      .sort((left, right) => String(left.agentId).localeCompare(String(right.agentId)))).toEqual([
      { agentId: 'Chaos-id', agentVersionId: 'Chaos-version-id', stage: 'analysis' },
      { agentId: 'Coherence-id', agentVersionId: 'Coherence-version-id', stage: 'analysis' },
      ].sort((left, right) => left.agentId.localeCompare(right.agentId)));
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

  it('fails the whole analysis set when an agent remains invalid after its retry', async () => {
    const { service, traces } = setup(async (params) => {
      const systemPrompt = params.messages[0]?.content;
      if (typeof systemPrompt === 'string' && systemPrompt.includes('Instructions for Chaos.')) {
        return completion('{"v":2}');
      }
      return completion(JSON.stringify({ v: 1, agent: 'Coherence', summary: 'Valid.', items: [] }));
    });

    await expect(service.generate({
      turnId: 'turn',
      agents: [agent('Chaos'), agent('Coherence')],
      systemPrompt: 'Project prompt.',
      history: [],
      userMessage: {
        id: 'user', projectId: 'project', role: 'user', content: 'Open the door.', createdAt: new Date(),
      },
      signal: new AbortController().signal,
    })).rejects.toBeInstanceOf(AggregateError);

    expect(traces.filter((trace) => trace.agentId === 'Chaos-id')).toHaveLength(2);
    expect(traces.filter((trace) => trace.agentId === 'Coherence-id')).toHaveLength(1);
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
