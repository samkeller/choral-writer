import { APIConnectionError, APIConnectionTimeoutError, APIError } from 'openai/error';
import { describe, expect, it } from 'vitest';

import { toPublicError } from '../errors/errors.js';
import { normalizeLlmError } from '../errors/llmErrors.js';

describe('LLM error normalization', () => {
  it('preserves a provider 402 message and request reference without requiring a dedicated SDK subclass', () => {
    const error = APIError.generate(402, {
      error: { message: 'Insufficient Balance', request_id: 'provider-request' },
    }, undefined, new Headers());

    expect(toPublicError(normalizeLlmError(error))).toEqual({
      status: 402, source: 'llm', code: 'LLM_INSUFFICIENT_BALANCE',
      message: 'Insufficient Balance', requestId: 'provider-request',
    });
  });

  it('normalizes inline stream errors whose HTTP status is unavailable', () => {
    const error = new APIError(undefined, { code: 429, message: 'Too many requests' }, undefined, undefined);
    expect(toPublicError(normalizeLlmError(error))).toMatchObject({
      status: 429, source: 'llm', code: 'LLM_RATE_LIMITED', message: 'Too many requests',
    });
  });

  it('redacts the configured API key and omits provider metadata and headers', () => {
    const error = APIError.generate(401, {
      error: { message: 'Invalid key: test-provider-key', metadata: { private: 'do not expose' } },
    }, undefined, new Headers({ 'x-request-id': 'req-401', authorization: 'Bearer test-provider-key' }));

    const publicError = toPublicError(normalizeLlmError(error, 'test-provider-key'));
    expect(publicError).toMatchObject({
      code: 'LLM_AUTHENTICATION_ERROR', source: 'llm', status: 401,
      message: 'Invalid key: [REDACTED]', requestId: 'req-401',
    });
    expect(JSON.stringify(publicError)).not.toContain('test-provider-key');
    expect(JSON.stringify(publicError)).not.toContain('do not expose');
    expect(JSON.stringify(publicError)).not.toContain('authorization');
  });

  it.each([
    [new APIConnectionError({}), 'LLM_UNAVAILABLE', 502],
    [new APIConnectionTimeoutError(), 'LLM_TIMEOUT', 504],
  ])('provides a public message for SDK transport failures (%s)', (error, code, status) => {
    expect(toPublicError(normalizeLlmError(error))).toMatchObject({ code, status, source: 'llm' });
  });
});
