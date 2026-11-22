import {
  headInputSchema, regenerateInputSchema, sendMessageSchema, type ChatCommand, type ChatEvent,
} from '@choral-writer/shared';

import { checkUnauthorized, ClientApiError, createClientApiError } from '../client';
import { readChatEvents } from './chatEvents';

/** Dispatches progress until a terminal event, never forwarding buffered events after cancellation. */
export async function streamTurn(
  command: ChatCommand,
  signal: AbortSignal,
  onEvent: (event: ChatEvent) => void,
): Promise<void> {
  const base = `/api/projects/${command.projectId}/branches/${command.branchId}/turns`;
  const url = command.operation === 'send' ? base : `${base}/${command.turnId}/${command.operation}`;
  const head = { expectedHeadTurnId: command.expectedHeadTurnId, allowLegacyMemoryReset: command.allowLegacyMemoryReset };
  const input = command.operation === 'send'
    ? sendMessageSchema.parse({ expectedHeadTurnId: command.expectedHeadTurnId, content: command.content })
    : command.operation === 'regenerate'
      ? regenerateInputSchema.parse({ ...head, configuration: command.configuration })
      : headInputSchema.parse(head);
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(input),
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
    signal.throwIfAborted();
    onEvent(event);
    if (event.type === 'chat.turn.failed') throw new ClientApiError(event.error);
    if (event.type === 'chat.turn.completed') return;
  }
  signal.throwIfAborted();
  throw new Error('La connexion a été interrompue avant la fin de la réponse. Rechargez la conversation.');
}