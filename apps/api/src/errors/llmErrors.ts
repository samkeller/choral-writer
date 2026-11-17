import { APIConnectionError, APIConnectionTimeoutError, APIError, APIUserAbortError } from 'openai/error';
import { z } from 'zod';

import { ApiError } from './errors.js';

const providerErrorSchema = z.object({
  message: z.string().min(1).optional(),
  code: z.union([z.number(), z.string()]).nullish(),
  request_id: z.string().nullish(),
});

const providerCodes: Partial<Record<number, string>> = {
  401: 'LLM_AUTHENTICATION_ERROR',
  402: 'LLM_INSUFFICIENT_BALANCE',
  403: 'LLM_FORBIDDEN',
  429: 'LLM_RATE_LIMITED',
};

export function normalizeLlmError(error: unknown, apiKey?: string, signal?: AbortSignal): unknown {
  if (error instanceof ApiError) return error;
  if (error instanceof APIConnectionTimeoutError
    || (signal?.aborted && signal.reason instanceof Error && signal.reason.name === 'TimeoutError')) {
    return new ApiError(504, 'LLM_TIMEOUT', 'Le fournisseur LLM n’a pas répondu dans le délai imparti.', {
      source: 'llm', cause: error,
    });
  }
  if (error instanceof APIUserAbortError) {
    return new ApiError(499, 'LLM_CANCELLED', 'La génération a été interrompue.', { source: 'llm', cause: error });
  }
  if (error instanceof APIConnectionError) {
    return new ApiError(502, 'LLM_UNAVAILABLE', 'Impossible de joindre le fournisseur LLM.', {
      source: 'llm', cause: error,
    });
  }
  if (!(error instanceof APIError)) return error;

  const parsed = providerErrorSchema.safeParse(error.error);
  const body = parsed.success ? parsed.data : undefined;
  const candidateStatus = error.status ?? (typeof body?.code === 'number' ? body.code : undefined);
  const status = candidateStatus && Number.isInteger(candidateStatus) && candidateStatus >= 400 && candidateStatus <= 599
    ? candidateStatus : 502;
  // Only the provider's textual message is public, never its raw body or metadata.
  const message = body?.message ?? (error.error === undefined ? error.message : undefined)
    ?? `Le fournisseur LLM a refusé la requête (${status}).`;
  const redact = (text: string) => apiKey ? text.split(apiKey).join('[REDACTED]') : text;
  const requestId = error.requestID || body?.request_id;
  return new ApiError(status, providerCodes[status] ?? 'LLM_PROVIDER_ERROR', redact(message), {
    source: 'llm',
    ...(requestId ? { requestId: redact(requestId) } : {}),
    cause: error,
  });
}
