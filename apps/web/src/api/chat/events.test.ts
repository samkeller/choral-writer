import { describe, expect, it } from 'vitest';

import { readChatEvents } from './events.js';
import { bytesStream } from './testing/streams.js';

describe('chat SSE parser', () => {
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