import { describe, expect, it, vi } from 'vitest';
import type { ChatCompletion, ChatCompletionChunk, ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';
import { z } from 'zod';

import { createCallLLM, type LlmCallTrace, type LlmUsageFact } from './call-llm.js';
import { createTestCallLLM, flushUsage, testProvider } from '../tests/support/callLLM.js';

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

const projectId = '019ad30c-19b0-7000-8000-000000000001';

function setup(create: (params: ChatCompletionCreateParamsNonStreaming) => Promise<ChatCompletion>) {
  const insert = vi.fn<(trace: LlmCallTrace) => Promise<void>>().mockResolvedValue(undefined);
  const callLLM = createCallLLM({
    client: { chat: { completions: { create: (params) => {
      if (params.stream) throw new Error('Unexpected streaming request.');
      return create(params);
    } } } },
    traces: { insert },
    model: 'test-model',
    provider: testProvider,
    now: vi.fn().mockReturnValueOnce(100).mockReturnValue(125),
  });
  return { callLLM, insert };
}

describe('callLLM', () => {
  it('saves a successful response and token usage to the trace', async () => {
    const { callLLM, insert } = setup(async () => ({
      ...completion('hello'),
      usage: { prompt_tokens: 8, completion_tokens: 2, total_tokens: 10 },
    }));

    const result = await callLLM({
      projectId, stage: 'narrator',
      agentId: 'narrator',
      agentVersionId: 'narrator-v2',
      messages: [{ role: 'user', content: 'begin' }],
    });

    expect(result.content).toBe('hello');
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      id: result.callId,
      projectId, stage: 'narrator',
      agentId: 'narrator',
      agentVersionId: 'narrator-v2',
      response: 'hello',
      inputTokens: 8,
      outputTokens: 2,
      durationMs: 25,
      status: 'success',
    }));
  });

  it('returns validated structured output', async () => {
    const { callLLM, insert } = setup(async () => completion('{"count":3}'));

    const result = await callLLM({
      projectId, stage: 'analysis',
      messages: [{ role: 'user', content: 'count' }],
      schema: z.object({ count: z.number() }),
    });

    expect(result.parsed).toEqual({ count: 3 });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
  });

  it.each([false, true])('preserves received memory in traces without sending trace metadata to the provider (failure=%s)', async (fail) => {
    const create = vi.fn(async (_params: ChatCompletionCreateParamsNonStreaming) => {
      if (fail) throw new Error('Simulated provider failure.');
      return completion('hello');
    });
    const { callLLM, insert } = setup(create);
    const memory = { tags: [], entries: [] };
    const request = callLLM({ projectId, stage: 'analysis', messages: [{ role: 'user', content: 'begin' }], memory });
    if (fail) await expect(request).rejects.toThrow();
    else await request;
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ memory, status: fail ? 'error' : 'success' }));
    expect(create.mock.calls[0]).toHaveLength(1);
    expect(create.mock.calls[0]![0]).not.toHaveProperty('memory');
  });

  it('traces invalid structured output and propagates the validation error', async () => {
    const { callLLM, insert } = setup(async () => completion('{"count":"not a number"}'));

    await expect(callLLM({
      projectId, stage: 'analysis',
      messages: [{ role: 'user', content: 'analyze' }],
      schema: z.object({ count: z.number() }),
    })).rejects.toThrow();

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      response: '{"count":"not a number"}',
      status: 'error',
    }));
  });

  it('rejects truncated but parseable JSON and correlates the failed memory attempt', async () => {
    const response = completion('{"count":3}');
    response.choices[0]!.finish_reason = 'length';
    const { callLLM, insert } = setup(async () => response);
    await expect(callLLM({ projectId, stage: 'guardian', stageExecutionId: 'memory-run',
      messages: [{ role: 'user', content: 'memorize' }], schema: z.object({ count: z.number() }),
    })).rejects.toMatchObject({ code: 'LLM_INCOMPLETE_RESPONSE' });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      stageExecutionId: 'memory-run', status: 'error', response: '{"count":3}',
    }));
  });

  it('forwards the output ceiling only when one is requested', async () => {
    const create = vi.fn(async (_params: ChatCompletionCreateParamsNonStreaming) => completion('story'));
    const { callLLM } = setup(create);

    await callLLM({ projectId, stage: 'narrator', messages: [{ role: 'user', content: 'begin' }], maxTokens: 8_192 });
    await callLLM({ projectId, stage: 'guardian', messages: [{ role: 'user', content: 'memorize' }] });

    expect(create.mock.calls[0]![0]).toMatchObject({ max_tokens: 8_192 });
    expect(create.mock.calls[1]![0]).not.toHaveProperty('max_tokens');
  });

  it('records provider errors in the trace', async () => {
    const { callLLM, insert } = setup(async () => {
      throw new Error('provider unavailable');
    });

    await expect(callLLM({
      projectId, stage: 'narrator',
      messages: [{ role: 'user', content: 'begin' }],
    })).rejects.toThrow('provider unavailable');

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      response: null,
      status: 'error',
      error: 'provider unavailable',
    }));
  });

  it('surfaces a trace persistence failure instead of returning an untraced response', async () => {
    const { callLLM, insert } = setup(async () => completion('hello'));
    insert.mockRejectedValue(new Error('database unavailable'));

    await expect(callLLM({
      projectId, stage: 'narrator',
      messages: [{ role: 'user', content: 'begin' }],
    })).rejects.toThrow('database unavailable');
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('streams deltas and traces the full response and streamed token usage', async () => {
    async function* chunks(): AsyncGenerator<ChatCompletionChunk> {
      for (const content of ['Bon', 'jour']) {
        yield {
          id: 'stream', object: 'chat.completion.chunk', created: 0, model: 'test-model',
          choices: [{ index: 0, delta: { content }, finish_reason: null }],
        };
      }
      yield {
        id: 'stream', object: 'chat.completion.chunk', created: 0, model: 'test-model',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
      };
    }
    const { callLLM, insert } = createTestCallLLM({ create: async () => chunks(), collectUsage: true });
    const onDelta = vi.fn();
    const result = await callLLM({ projectId, stage: 'narrator', messages: [], onDelta });

    expect(onDelta.mock.calls).toEqual([['Bon'], ['jour']]);
    expect(result.content).toBe('Bonjour');
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      response: 'Bonjour', status: 'success', inputTokens: 10, outputTokens: 2,
    }));
  });

  it('traces a truncated stream as an error while preserving the partial raw response', async () => {
    async function* chunks(): AsyncGenerator<ChatCompletionChunk> {
      yield {
        id: 'stream', object: 'chat.completion.chunk', created: 0, model: 'test-model',
        choices: [{ index: 0, delta: { content: 'partial' }, finish_reason: null }],
      };
    }
    const { callLLM, insert } = createTestCallLLM({ create: async () => chunks(), collectUsage: true });

    await expect(callLLM({ projectId, stage: 'narrator', messages: [], onDelta: vi.fn() }))
      .rejects.toMatchObject({ code: 'LLM_INCOMPLETE_RESPONSE', statusCode: 502 });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      response: 'partial', status: 'error',
    }));
  });

  it('records a usage fact per call, tagged with the project and the resolved price window', async () => {
    const { callLLM, usages } = createTestCallLLM({
      create: async () => ({
        ...completion('hello'),
        usage: { prompt_tokens: 8, completion_tokens: 2, total_tokens: 10 },
      }),
      collectUsage: true,
    });

    const result = await callLLM({ projectId, turnId: 'turn-1', stage: 'narrator', messages: [] });
    await flushUsage();

    expect(usages).toHaveLength(1);
    expect(usages[0]).toMatchObject({
      callId: result.callId,
      projectId,
      turnId: 'turn-1',
      stage: 'narrator',
      inputTokens: 8,
      outputTokens: 2,
      providerCostUsd: null,
      status: 'success',
      priceWindow: 'all',
    });
  });

  it('records a usage fact for a failed call so its cost is never silently lost', async () => {
    const { callLLM, usages } = createTestCallLLM({
      create: async () => { throw new Error('provider unavailable'); },
      collectUsage: true,
    });

    await expect(callLLM({ projectId, turnId: 'turn-2', stage: 'analysis', messages: [] })).rejects.toThrow();
    await flushUsage();

    expect(usages).toHaveLength(1);
    expect(usages[0]).toMatchObject({ turnId: 'turn-2', status: 'error', inputTokens: null, outputTokens: null });
  });

  it('keeps a successful narration when the usage registry fails', async () => {
    const callLLM = createCallLLM({
      client: { chat: { completions: { create: async () => completion('hello') } } },
      traces: { insert: async () => {} },
      model: 'test-model',
      provider: testProvider,
      usage: { record: async () => { throw new Error('registry unavailable'); } },
    });

    await expect(callLLM({ projectId, stage: 'narrator', messages: [] }))
      .resolves.toMatchObject({ content: 'hello' });
  });

  it('drops implausible token counts instead of failing the call', async () => {
    const { callLLM, usages } = createTestCallLLM({
      create: async () => ({
        ...completion('hello'),
        usage: { prompt_tokens: -5, completion_tokens: 2, total_tokens: 10 },
      }),
      collectUsage: true,
    });

    await callLLM({ projectId, stage: 'narrator', messages: [] });
    await flushUsage();

    expect(usages[0]).toMatchObject({ inputTokens: null, outputTokens: 2 });
  });

  it('captures provider cache tokens and a provider-confirmed cost through the strategy', async () => {
    const { callLLM, usages } = createTestCallLLM({
      create: async () => ({
        ...completion('hello'),
        usage: {
          prompt_tokens: 100, completion_tokens: 10, total_tokens: 110,
          prompt_tokens_details: { cached_tokens: 64 }, cost: 0.000123,
        },
      }),
      collectUsage: true,
      provider: {
        ...testProvider,
        extractUsage: (raw) => {
          const usage = (raw as { usage: { prompt_tokens: number; completion_tokens: number; prompt_tokens_details: { cached_tokens: number } } }).usage;
          return {
            inputTokens: usage.prompt_tokens,
            outputTokens: usage.completion_tokens,
            cachedInputTokens: usage.prompt_tokens_details.cached_tokens,
          };
        },
        providerCostUsd: (raw) => (raw as { usage: { cost: number } }).usage.cost,
      },
    });

    await callLLM({ projectId, stage: 'guardian', messages: [] });
    await flushUsage();

    expect(usages[0]).toMatchObject({ cachedInputTokens: 64, providerCostUsd: 0.000123 });
  });
});
