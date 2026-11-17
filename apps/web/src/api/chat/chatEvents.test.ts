import { describe, expect, it } from 'vitest';

import { readChatEvents } from './chatEvents';
import { bytesStream } from './testing/streams';

describe('chat SSE parser', () => {
  it.each(['chat.turn.started', 'chat.turn.completed'])('parses message dates in %s events', async (type) => {
    const id = '019ad30c-19b0-7000-8000-000000000001';
    const createdAt = '2026-11-17T10:00:00.000Z';
    const payload = {
      type, turnId: id, branchId: id, operation: 'send',
      message: { id, projectId: id, role: 'user', content: 'Bonjour', createdAt },
    };
    const events = [];
    for await (const event of readChatEvents(bytesStream([
      new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`),
    ]))) events.push(event);
    expect(events[0]).toMatchObject({ type, message: { createdAt: new Date(createdAt) } });
  });

  it('rejects invalid nested message dates in SSE events', async () => {
    const id = '019ad30c-19b0-7000-8000-000000000001';
    const payload = {
      type: 'chat.turn.completed', turnId: id, branchId: id,
      message: { id, projectId: id, role: 'assistant', content: 'Bonjour', createdAt: 'invalid' },
    };
    const events = readChatEvents(bytesStream([
      new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`),
    ]));
    await expect(events.next()).rejects.toThrow();
  });

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
});