import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { LlmClient, type CallTrace, type CompleteOptions } from './llm.js';

const options: CompleteOptions<string> = {
  projectId: 'project', purpose: 'test', model: 'model',
  messages: [{ role: 'user', content: 'Bonjour' }], maxTokens: 100
};

function response(content: string) {
  return new Response(JSON.stringify({
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 10, completion_tokens: 3, prompt_tokens_details: { cached_tokens: 4 }, cost: 0.001 }
  }), { status: 200 });
}

describe('LlmClient', () => {
  it('records the response, usage and request', async () => {
    const traces: CallTrace[] = [];
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response('Bonjour !'));
    const client = new LlmClient('https://example.test/v1/', 'secret', async trace => { traces.push(trace); }, fetcher);

    await expect(client.complete(options)).resolves.toBe('Bonjour !');
    expect(fetcher.mock.calls[0][0]).toBe('https://example.test/v1/chat/completions');
    expect(traces).toMatchObject([{
      status: 'succeeded', response: 'Bonjour !', model: 'model',
      messages: options.messages, inputTokens: 10, outputTokens: 3, cachedTokens: 4, costUsd: 0.001
    }]);
  });

  it('repairs invalid JSON once and traces both requests', async () => {
    const traces: CallTrace[] = [];
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response('invalid')).mockResolvedValueOnce(response('{"value":42}'));
    const client = new LlmClient('https://example.test', 'secret', async trace => { traces.push(trace); }, fetcher);

    await expect(client.complete({ ...options, schema: z.object({ value: z.number() }) })).resolves.toEqual({ value: 42 });
    expect(traces).toHaveLength(2);
    expect(traces[1].messages).toHaveLength(3);
    expect(traces[1].messages[1].content).toBe('invalid');
  });

  it('retries a transient failure and records each attempt', async () => {
    const traces: CallTrace[] = [];
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValueOnce(response('ok'));
    const client = new LlmClient('https://example.test', 'secret', async trace => { traces.push(trace); }, fetcher);

    await expect(client.complete(options)).resolves.toBe('ok');
    expect(traces.map(trace => trace.status)).toEqual(['failed', 'succeeded']);
    expect(traces[0].error).toContain('503');
  });

  it('does not retry a permanent provider error', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 401 }));
    const trace = vi.fn(async (_trace: CallTrace) => {});
    const client = new LlmClient('https://example.test', 'secret', trace, fetcher);

    await expect(client.complete(options)).rejects.toThrow('401');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(trace).toHaveBeenCalledOnce();
  });

  it('does not report success when the trace cannot be persisted', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response('ok'));
    const client = new LlmClient('https://example.test', 'secret', async () => { throw new Error('database unavailable'); }, fetcher);

    await expect(client.complete(options)).rejects.toThrow('database unavailable');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('handles streamed chunks with null usage and records final usage', async () => {
    const traces: CallTrace[] = [];
    const frames = [
      { choices: [{ delta: { content: 'É' } }], usage: null },
      { choices: [{ delta: { content: 'cho' } }], usage: null },
      { choices: [], usage: { prompt_tokens: 10, completion_tokens: 2 } }
    ].map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n';
    const bytes = new TextEncoder().encode(frames);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(new ReadableStream({
      start(controller) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
        controller.close();
      }
    })));
    const client = new LlmClient('https://example.test', 'secret', async trace => { traces.push(trace); }, fetcher);
    let text = '';
    await expect(client.stream(options, chunk => { text += chunk; })).resolves.toBe('Écho');
    expect(text).toBe('Écho');
    expect(traces).toMatchObject([{ response: 'Écho', status: 'succeeded', inputTokens: 10, outputTokens: 2 }]);
  });
});
