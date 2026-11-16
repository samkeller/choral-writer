import axios from 'axios';
import { apiErrorSchema, type PublicError } from '@choral-writer/shared';

export class ClientApiError extends Error {
  constructor(public readonly details: PublicError, options?: ErrorOptions) {
    super(details.message, options);
  }
}

export function createClientApiError(data: unknown, status: number): ClientApiError {
  const parsed = apiErrorSchema.safeParse(data);
  return new ClientApiError(parsed.success ? parsed.data.error : {
    code: 'HTTP_ERROR',
    message: `Le serveur a répondu avec le code ${status}.`,
    status,
    source: 'application',
  });
}

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 15_000,
});

export const sessionEvents = new EventTarget();

export function checkUnauthorized(
  status: number | undefined,
  url?: string,
  source: PublicError['source'] = 'application',
) {
  if (status === 401 && source === 'application' && url !== '/login') {
    sessionEvents.dispatchEvent(new Event('unauthorized'));
  }
}

api.interceptors.response.use(undefined, (error: unknown) => {
  if (axios.isAxiosError<unknown>(error)) {
    if (error.response) {
      const normalized = createClientApiError(error.response.data, error.response.status);
      checkUnauthorized(normalized.details.status, error.config?.url, normalized.details.source);
      return Promise.reject(normalized);
    }
  }
  return Promise.reject(error);
});

export function getErrorMessage(error: unknown): string {
  if (error instanceof ClientApiError) {
    const { message, requestId } = error.details;
    return requestId && !message.includes(requestId) ? `${message} (référence : ${requestId})` : message;
  }
  if (axios.isAxiosError<unknown>(error)) {
    if (error.response) {
      return `Le serveur a répondu avec le code ${error.response.status}.`;
    }
    return 'Le serveur est inaccessible. Réessayez dans quelques instants.';
  }
  return error instanceof Error ? error.message : 'Une erreur inattendue est survenue.';
}
