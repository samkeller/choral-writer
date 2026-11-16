import { describe, expect, it, vi } from 'vitest';
import type { ChatCompletion, ChatCompletionChunk, ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';
import { z } from 'zod';

import { createCallLLM, type LlmCallTrace } from './call-llm.js';

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

function setup(create: (params: ChatCompletionCreateParamsNonStreaming) => Promise<ChatCompletion>) {
  const insert = vi.fn<(trace: LlmCallTrace) => Promise<void>>().mockResolvedValue(undefined);
  const callLLM = createCallLLM({
    client: { chat: { completions: { create: (params) => {
      if (params.stream) throw new Error('Unexpected streaming request.');
      return create(params);
    } } } },
    traces: { insert },
    model: 'test-model',
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
      stage: 'narrator',
      messages: [{ role: 'user', content: 'begin' }],
    });

    expect(result.content).toBe('hello');
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      id: result.callId,
      stage: 'narrator',
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
      stage: 'analysis',
      messages: [{ role: 'user', content: 'count' }],
      schema: z.object({ count: z.number() }),
    });

    expect(result.parsed).toEqual({ count: 3 });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
  });

  it('traces invalid structured output and propagates the validation error', async () => {
    const { callLLM, insert } = setup(async () => completion('{"count":"not a number"}'));

    await expect(callLLM({
      stage: 'analysis',
      messages: [{ role: 'user', content: 'analyze' }],
      schema: z.object({ count: z.number() }),
    })).rejects.toThrow();

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      response: '{"count":"not a number"}',
      status: 'error',
    }));
  });

  it('records provider errors in the trace', async () => {
    const { callLLM, insert } = setup(async () => {
      throw new Error('provider unavailable');
    });

    await expect(callLLM({
      stage: 'narrator',
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
      stage: 'narrator',
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
    const insert = vi.fn().mockResolvedValue(undefined);
    const callLLM = createCallLLM({
      client: { chat: { completions: { create: async () => chunks() } } },
      model: 'test-model', traces: { insert },
    });
    const onDelta = vi.fn();
    const result = await callLLM({ stage: 'narrator', messages: [], onDelta });

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
    const insert = vi.fn().mockResolvedValue(undefined);
    const callLLM = createCallLLM({
      client: { chat: { completions: { create: async () => chunks() } } },
      model: 'test-model', traces: { insert },
    });

    await expect(callLLM({ stage: 'narrator', messages: [], onDelta: vi.fn() }))
      .rejects.toMatchObject({ code: 'LLM_INCOMPLETE_RESPONSE', statusCode: 502 });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      response: 'partial', status: 'error',
    }));
  });
});
