import { afterEach, describe, expect, it, vi } from 'vitest';

import { ClientApiError, sessionEvents } from '../client';
import { streamTurn } from './chatStream';
import { bytesStream } from './testing/streams';

afterEach(() => vi.unstubAllGlobals());

const command = {
  projectId: 'project', branchId: 'branch', expectedHeadTurnId: null,
  operation: 'send' as const, content: 'hello',
};

describe('chat SSE commands', () => {
  it('sends the explicit legacy memory reset acknowledgement on regeneration', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 409,
      headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    await expect(streamTurn({ ...command, operation: 'regenerate', turnId: 'old-turn', allowLegacyMemoryReset: true },
      new AbortController().signal, vi.fn())).rejects.toBeInstanceOf(ClientApiError);
    expect(fetch.mock.calls[0]![0]).toContain('/old-turn/regenerate');
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({ expectedHeadTurnId: null, allowLegacyMemoryReset: true });
  });
  it('rejects a connection that ends without completion instead of accepting a partial answer', async () => {
    const stream = bytesStream([new TextEncoder().encode(
      'data: {"type":"chat.message.delta","delta":"partial"}\n\n',
    )]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream' },
    })));
    const onEvent = vi.fn();

    await expect(streamTurn(command, new AbortController().signal, onEvent))
      .rejects.toThrow('interrompue');
    expect(onEvent).toHaveBeenCalledWith({ type: 'chat.message.delta', delta: 'partial' });
  });

  it.each([1, 2])('honors cancellation with %i buffered events instead of updating an abandoned view', async (count) => {
    const stream = bytesStream([new TextEncoder().encode(
      'data: {"type":"chat.message.delta","delta":"partial"}\n\n'.repeat(count),
    )]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream' },
    })));
    const controller = new AbortController();
    const reason = new DOMException('Navigation changed.', 'AbortError');
    const onEvent = vi.fn(() => controller.abort(reason));

    await expect(streamTurn(command, controller.signal, onEvent)).rejects.toBe(reason);
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it('invalidates an expired session for fetch-based streams as well as Axios', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required.', status: 401, source: 'application' },
    }), { status: 401, headers: { 'Content-Type': 'application/json' } })));
    const expired = vi.fn();
    sessionEvents.addEventListener('unauthorized', expired);
    try {
      await expect(streamTurn(command, new AbortController().signal, vi.fn()))
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

    await expect(streamTurn(command, new AbortController().signal, vi.fn()))
      .rejects.toMatchObject({ message: 'Insufficient Balance', details: error });
  });

  it('does not expire the session for a provider authentication error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: 'LLM_AUTHENTICATION_ERROR', message: 'Invalid provider key', status: 401, source: 'llm' },
    }), { status: 401, headers: { 'Content-Type': 'application/json' } })));
    const expired = vi.fn();
    sessionEvents.addEventListener('unauthorized', expired);
    try {
      await expect(streamTurn(command, new AbortController().signal, vi.fn()))
        .rejects.toBeInstanceOf(ClientApiError);
      expect(expired).not.toHaveBeenCalled();
    } finally {
      sessionEvents.removeEventListener('unauthorized', expired);
    }
  });
});
