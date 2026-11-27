import { describe, expect, it } from 'vitest';

import { estimateCost, outputTokensFor, rateBounds, TYPICAL_OUTPUT_TOKENS, type EstimatedCall } from './costEstimate.js';

const offPeak = { id: 'off', inputPerMillion: 1, outputPerMillion: 2, cacheReadPerMillion: null };
const peak = { id: 'peak', inputPerMillion: 2, outputPerMillion: 4, cacheReadPerMillion: null };

describe('cost estimate', () => {
  it('keeps the simulated prose for the Narrator and typical sizes for structured outputs', () => {
    expect(outputTokensFor('narrator', 1_234, 'high')).toBe(1_234);
    expect(outputTokensFor('analysis', 1_234, 'low')).toBe(TYPICAL_OUTPUT_TOKENS.analysis.low);
    expect(outputTokensFor('judge', 0, 'high')).toBe(TYPICAL_OUTPUT_TOKENS.judge.high);
  });

  it('bounds the price with the cheapest and the most expensive published rate', () => {
    expect(rateBounds([peak, offPeak])).toEqual({ low: offPeak, high: peak });
    expect(rateBounds([])).toBeNull();
  });

  it('prices each bound, counts retries of structured calls in the high bound only, and splits by configuration', () => {
    const calls = (outputTokens: number): EstimatedCall[] => [
      { configuration: 'v1', stage: 'narrator', inputTokens: 1_000_000, outputTokens },
      { configuration: 'v2', stage: 'analysis', inputTokens: 1_000_000, outputTokens: 0 },
    ];
    const estimate = estimateCost({ low: calls(500_000), high: calls(1_000_000) }, { low: offPeak, high: peak }, 0.5);

    // Low: 2 M input at 1 $ + 0.5 M output at 2 $; high: the analysis call weighs 1.5.
    expect(estimate.total.low).toEqual({ calls: 2, inputTokens: 2_000_000, outputTokens: 500_000, usd: 3 });
    expect(estimate.total.high).toEqual({ calls: 2.5, inputTokens: 2_500_000, outputTokens: 1_000_000, usd: 9 });
    expect(estimate.byConfiguration.v1?.high).toEqual({ calls: 1, inputTokens: 1_000_000, outputTokens: 1_000_000, usd: 6 });
    expect(estimate.byConfiguration.v2?.low.usd).toBe(1);
    expect(estimate.byConfiguration.v2?.high.usd).toBe(3);
  });
});
