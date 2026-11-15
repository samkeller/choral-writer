import type { TurnStreamEvent } from './types.js';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function api<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const result: unknown = await response.json().catch(() => undefined);
    const message =
      typeof result === 'object' && result !== null && 'error' in result && typeof result.error === 'string'
        ? result.error
        : `Erreur HTTP ${response.status}`;
    throw new ApiError(message, response.status);
  }
  return response.json() as Promise<T>;
}

function isPayload(value: unknown): value is TurnStreamEvent['payload'] {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function streamTurn(
  url: string,
  body: { userInput: string; metaDirection: string },
  onEvent: (event: TurnStreamEvent) => void,
): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const result: unknown = await response.json().catch(() => undefined);
    const message =
      typeof result === 'object' && result !== null && 'error' in result && typeof result.error === 'string'
        ? result.error
        : `Erreur HTTP ${response.status}`;
    throw new ApiError(message, response.status);
  }
  if (!response.body) throw new Error('Flux indisponible');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const consume = (frame: string) => {
    const lines = frame.split(/\r?\n/);
    const event = lines
      .find((line) => line.startsWith('event:'))
      ?.slice(6)
      .trim();
    const data = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!event || !data) return;
    const payload: unknown = JSON.parse(data);
    if (!isPayload(payload)) throw new Error('Événement de récit invalide');
    onEvent({ event, payload });
  };

  try {
    for (;;) {
      const part = await reader.read();
      buffer += decoder.decode(part.value, { stream: !part.done });
      let boundary = buffer.search(/\r?\n\r?\n/);
      while (boundary >= 0) {
        const separator = /^\r?\n\r?\n/.exec(buffer.slice(boundary))?.[0];
        if (!separator) break;
        consume(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + separator.length);
        boundary = buffer.search(/\r?\n\r?\n/);
      }
      if (part.done) break;
    }
    if (buffer.trim()) consume(buffer);
  } finally {
    reader.releaseLock();
  }
}
