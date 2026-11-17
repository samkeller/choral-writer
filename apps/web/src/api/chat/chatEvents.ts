import { chatEventSchema, type ChatEvent } from '@choral-writer/shared';

export async function* readChatEvents(stream: ReadableStream<Uint8Array>): AsyncGenerator<ChatEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let data: string[] = [];

  function parseLine(line: string): ChatEvent | undefined {
    if (line.endsWith('\r')) line = line.slice(0, -1);
    if (line === '') {
      if (data.length === 0) return;
      const event = chatEventSchema.parse(JSON.parse(data.join('\n')));
      data = [];
      return event;
    }
    if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
  }

  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let end: number;
      while ((end = buffer.indexOf('\n')) !== -1) {
        const event = parseLine(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
        if (event) yield event;
      }
      if (done) {
        if (buffer) {
          const event = parseLine(buffer);
          if (event) yield event;
        }
        const event = parseLine('');
        if (event) yield event;
        break;
      }
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}