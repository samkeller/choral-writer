import { AxiosError, type AxiosAdapter } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { api, ClientApiError, getErrorMessage, sessionEvents } from './client.js';

const originalAdapter = api.defaults.adapter;
afterEach(() => { api.defaults.adapter = originalAdapter; });

describe('REST public errors', () => {
  it('preserves the typed public contract and renders a provider request reference generically', async () => {
    const adapter: AxiosAdapter = async (config) => {
      throw new AxiosError('Request failed', undefined, config, undefined, {
        config, status: 402, statusText: '', headers: {},
        data: {
          error: {
            code: 'LLM_INSUFFICIENT_BALANCE', message: 'Insufficient Balance',
            status: 402, source: 'llm', requestId: 'provider-request',
          },
        },
      });
    };
    api.defaults.adapter = adapter;

    await expect(api.get('/any-feature')).rejects.toMatchObject({
      message: 'Insufficient Balance',
      details: { status: 402, source: 'llm', code: 'LLM_INSUFFICIENT_BALANCE', requestId: 'provider-request' },
    });
    const error = new ClientApiError({
      status: 402, source: 'llm', code: 'LLM_INSUFFICIENT_BALANCE',
      message: 'Insufficient Balance', requestId: 'provider-request',
    });
    expect(getErrorMessage(error)).toBe('Insufficient Balance (référence : provider-request)');
  });

  it.each(['application', 'llm'])('only expires the application session for its own 401 (%s)', async (source) => {
    api.defaults.adapter = async (config) => {
      throw new AxiosError('Request failed', undefined, config, undefined, {
        config, status: 401, statusText: '', headers: {},
        data: { error: { code: 'AUTH_ERROR', message: 'Authentication failed', status: 401, source } },
      });
    };
    const expired = vi.fn();
    sessionEvents.addEventListener('unauthorized', expired);
    try {
      await expect(api.get('/any-feature')).rejects.toBeInstanceOf(ClientApiError);
      expect(expired).toHaveBeenCalledTimes(source === 'application' ? 1 : 0);
    } finally {
      sessionEvents.removeEventListener('unauthorized', expired);
    }
  });
});
