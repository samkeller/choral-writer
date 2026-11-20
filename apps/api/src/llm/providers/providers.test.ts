import { describe, expect, it, vi } from 'vitest';

import { createDeepseekStrategy, offPeakHours } from './deepseek.js';
import { detectProvider, resolveProvider } from './detect.js';
import { createProviderStrategy } from './index.js';

const config = { apiKey: 'key', baseUrl: 'https://api.deepseek.com' };

describe('DeepSeek strategy', () => {
  it('reads the provider-specific cache field, falling back on the standard one', () => {
    const deepseek = createDeepseekStrategy(config);

    expect(deepseek.extractUsage({
      usage: { prompt_tokens: 100, completion_tokens: 10, prompt_cache_hit_tokens: 64 },
    })).toEqual({ inputTokens: 100, outputTokens: 10, cachedInputTokens: 64 });

    expect(deepseek.extractUsage({
      usage: { prompt_tokens: 100, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 32 } },
    }).cachedInputTokens).toBe(32);
  });

  it('reports no provider cost, because the API exposes none', () => {
    const deepseek = createDeepseekStrategy(config);

    expect(deepseek.providerCostUsd({ usage: { prompt_tokens: 1, completion_tokens: 1 } })).toBeNull();
    expect(deepseek.providerCostUsd({})).toBeNull();
  });

  it.each([
    ['2026-11-18T02:00:00Z', 'peak'],
    ['2026-11-18T08:00:00Z', 'peak'],
    ['2026-11-18T00:00:00Z', 'off_peak'],
    ['2026-11-18T05:00:00Z', 'off_peak'],
    ['2026-11-18T11:00:00Z', 'off_peak'],
    ['2026-11-21T08:00:00Z', 'off_peak'],
  ])('resolves the price window at %s as %s', (instant, expected) => {
    const deepseek = createDeepseekStrategy(config);

    expect(deepseek.priceWindow(new Date(instant))).toBe(expected);
  });

  it('treats any weekend instant as off-peak regardless of the hour', () => {
    // 2026-11-21 est un samedi : aucune heure pleine ne s'y applique.
    expect(offPeakHours(new Date('2026-11-21T09:00:00Z'))).toBe(true);
    expect(offPeakHours(new Date('2026-11-22T02:00:00Z'))).toBe(true);
  });

  it('reports an unavailable balance rather than failing when the provider errors', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    try {
      const balance = await createDeepseekStrategy(config).balance();
      expect(balance.status).toBe('unavailable');
      expect(balance.reason).toBeTruthy();
    } finally {
      globalThis.fetch = original;
    }
  });

  it('reads the balance breakdown reported by the provider', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        is_available: true,
        balance_infos: [{
          currency: 'USD', total_balance: '84.20', granted_balance: '4.20', topped_up_balance: '80.00',
        }],
      }),
    }) as unknown as typeof fetch;
    try {
      const balance = await createDeepseekStrategy(config).balance();
      expect(balance).toMatchObject({
        status: 'available', currency: 'USD', total: '84.20', granted: '4.20', toppedUp: '80.00',
      });
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('provider resolution', () => {
  it('detects DeepSeek from the API host as a documented fallback', () => {
    expect(detectProvider('https://api.deepseek.com')).toBe('deepseek');
    expect(detectProvider('https://custom.example.com/v1')).toBeNull();
    expect(detectProvider('not a url')).toBeNull();
  });

  it('lets an explicit provider override host detection', () => {
    expect(resolveProvider('deepseek', 'https://custom.example.com/v1')).toBe('deepseek');
    expect(resolveProvider('  ', 'https://api.deepseek.com')).toBe('deepseek');
  });

  it('refuses an unknown host instead of guessing a provider', () => {
    // Un hôte non reconnu ne peut être ni tarifé ni interrogé : mieux vaut échouer.
    expect(() => resolveProvider(undefined, 'https://custom.example.com/v1')).toThrow(/LLM_PROVIDER/);
  });

  it('refuses a provider that is not implemented yet', () => {
    expect(() => resolveProvider('openrouter', 'https://openrouter.ai/api/v1')).toThrow();
  });

  it('builds the DeepSeek strategy', () => {
    expect(createProviderStrategy('deepseek', config).name).toBe('deepseek');
  });
});
