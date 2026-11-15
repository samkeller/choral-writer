import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, streamTurn } from './api.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('web API client', () => {
  it('surfaces HTTP failures with status and server message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Session expirée' }), { status: 401 })),
    );

    const request = api('/api/projects');
    await expect(request).rejects.toBeInstanceOf(ApiError);
    await expect(request).rejects.toMatchObject({ message: 'Session expirée', status: 401 });
  });

  it('parses SSE events split across chunks and CRLF boundaries', async () => {
    const bytes = new TextEncoder().encode(
      'event: prose\r\ndata: {"text":"Bonjour"}\r\n\r\nevent: committed\r\ndata: {"turnId":"t1"}\r\n\r\n',
    );
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(bytes.slice(0, 17));
            controller.enqueue(bytes.slice(17, 44));
            controller.enqueue(bytes.slice(44));
            controller.close();
          },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetch);
    const events: { event: string; payload: unknown }[] = [];

    await streamTurn('/api/projects/p/turns', { userInput: 'Action', metaDirection: '' }, (event) => {
      events.push(event);
    });

    expect(events).toEqual([
      { event: 'prose', payload: { text: 'Bonjour' } },
      { event: 'committed', payload: { turnId: 't1' } },
    ]);
  });
});
