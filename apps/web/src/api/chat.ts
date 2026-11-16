import { chatEventSchema, messageInputSchema, type ChatEvent } from '@choral-writer/shared';

import { checkUnauthorized, ClientApiError, createClientApiError } from './client.js';

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

export async function streamTurn(
  projectId: string,
  content: string,
  signal: AbortSignal,
  onEvent: (event: ChatEvent) => void,
): Promise<void> {
  const response = await fetch(`/api/projects/${projectId}/turns`, {
    method: 'POST',
    credentials: 'include',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(messageInputSchema.parse({ content })),
  });
  if (!response.ok) {
    const data: unknown = response.headers.get('content-type')?.includes('application/json')
      ? await response.json() : undefined;
    const error = createClientApiError(data, response.status);
    checkUnauthorized(error.details.status, undefined, error.details.source);
    throw error;
  }
  if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
    throw new Error('Le serveur n’a pas renvoyé un flux de conversation valide.');
  }
  for await (const event of readChatEvents(response.body)) {
    onEvent(event);
    if (event.type === 'chat.turn.failed') throw new ClientApiError(event.error);
    if (event.type === 'chat.turn.completed') return;
  }
  throw new Error('La connexion a été interrompue avant la fin de la réponse. Rechargez la conversation.');
}
