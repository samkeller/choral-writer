import { ZodError } from 'zod';
import type { PublicError } from '@choral-writer/shared';

interface ApiErrorOptions {
  source?: PublicError['source'];
  requestId?: string;
  cause?: unknown;
}

export class ApiError extends Error {
  constructor(
    /**
     * Le code HTTP associé à cette erreur.
     */
    public readonly statusCode: number,
    /**
     * Le code d'erreur identifiant le type d'erreur.
     */
    public readonly code: string,
    /**
     * Le message d'erreur décrivant l'erreur.
     */
    message: string,
    public readonly options: ApiErrorOptions = {},
  ) {
    super(message, { cause: options.cause });
  }

  toPublicError(): PublicError {
    return {
      code: this.code,
      message: this.message,
      status: this.statusCode,
      source: this.options.source ?? 'application',
      ...(this.options.requestId ? { requestId: this.options.requestId } : {}),
    };
  }
}

export function toPublicError(error: unknown): PublicError {
  if (error instanceof ApiError) return error.toPublicError();
  if (error instanceof ZodError) {
    return new ApiError(400, 'INVALID_REQUEST', 'Les données envoyées sont invalides.').toPublicError();
  }
  if (error instanceof Error && 'code' in error && typeof error.code === 'string'
    && error.code.startsWith('FST_ERR_') && 'statusCode' in error
    && typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500) {
    return new ApiError(error.statusCode, 'REQUEST_ERROR', error.message).toPublicError();
  }
  return new ApiError(500, 'INTERNAL_SERVER_ERROR', 'Une erreur interne est survenue. Veuillez réessayer.').toPublicError();
}

export function isLockConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if ('code' in error && error.code === '55P03') return true;
  return 'cause' in error && isLockConflict(error.cause);
}

export const notfoundError = (message?: string, options?: ApiErrorOptions): ApiError => new ApiError(404, 'NOT_FOUND', message ?? 'La ressource demandée est introuvable.', options);
export const unauthorizedError = (message?: string, options?: ApiErrorOptions): ApiError => new ApiError(401, 'UNAUTHORIZED', message ?? 'Non autorisé.', options);
export const serviceUnavailableError = (message?: string, options?: ApiErrorOptions): ApiError => new ApiError(503, 'SERVICE_UNAVAILABLE', message ?? 'Le service est temporairement indisponible.', options);