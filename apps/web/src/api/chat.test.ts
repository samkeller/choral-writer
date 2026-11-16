import { afterEach, describe, expect, it, vi } from 'vitest';

import { ClientApiError, sessionEvents } from './client.js';
import { readChatEvents, streamTurn } from './chat.js';

function bytesStream(bytes: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const bytesPart of bytes) controller.enqueue(bytesPart);
      controller.close();
    },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('chat SSE', () => {
  it('handles fragmented UTF-8, CRLF, multiple events, and heartbeat comments', async () => {
    const bytes = new TextEncoder().encode(
      ': heartbeat\r\n\r\nevent: chat.message.delta\r\ndata: {"type":"chat.message.delta","delta":"Clé 🔑"}\r\n\r\n'
      + 'data: {"type":"chat.message.delta","delta":" suivante"}\n\n',
    );
    const events = [];
    for await (const event of readChatEvents(bytesStream(Array.from(bytes, (byte) => new Uint8Array([byte]))))) {
      events.push(event);
    }
    expect(events).toEqual([
      { type: 'chat.message.delta', delta: 'Clé 🔑' },
      { type: 'chat.message.delta', delta: ' suivante' },
    ]);
  });

  it('rejects a connection that ends without completion instead of accepting a partial answer', async () => {
    const stream = bytesStream([new TextEncoder().encode(
      'data: {"type":"chat.message.delta","delta":"partial"}\n\n',
    )]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream' },
    })));
    const onEvent = vi.fn();

    await expect(streamTurn('project', 'hello', new AbortController().signal, onEvent))
      .rejects.toThrow('interrompue');
    expect(onEvent).toHaveBeenCalledWith({ type: 'chat.message.delta', delta: 'partial' });
  });

  it('invalidates an expired session for fetch-based streams as well as Axios', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required.', status: 401, source: 'application' },
    }), { status: 401, headers: { 'Content-Type': 'application/json' } })));
    const expired = vi.fn();
    sessionEvents.addEventListener('unauthorized', expired);
    try {
      await expect(streamTurn('project', 'hello', new AbortController().signal, vi.fn()))
        .rejects.toThrow('Authentication required.');
      expect(expired).toHaveBeenCalledTimes(1);
    } finally {
      sessionEvents.removeEventListener('unauthorized', expired);
    }
  });

  it('preserves the same public error fields in a failed SSE event', async () => {
    const error = {
      code: 'LLM_INSUFFICIENT_BALANCE', message: 'Insufficient Balance',
      status: 402, source: 'llm', requestId: 'provider-request',
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      `data: ${JSON.stringify({ type: 'chat.turn.failed', error })}\n\n`,
      { headers: { 'Content-Type': 'text/event-stream' } },
    )));

    await expect(streamTurn('project', 'hello', new AbortController().signal, vi.fn()))
      .rejects.toMatchObject({ message: 'Insufficient Balance', details: error });
  });

  it('does not expire the session for a provider authentication error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: 'LLM_AUTHENTICATION_ERROR', message: 'Invalid provider key', status: 401, source: 'llm' },
    }), { status: 401, headers: { 'Content-Type': 'application/json' } })));
    const expired = vi.fn();
    sessionEvents.addEventListener('unauthorized', expired);
    try {
      await expect(streamTurn('project', 'hello', new AbortController().signal, vi.fn()))
        .rejects.toBeInstanceOf(ClientApiError);
      expect(expired).not.toHaveBeenCalled();
    } finally {
      sessionEvents.removeEventListener('unauthorized', expired);
    }
  });
});
