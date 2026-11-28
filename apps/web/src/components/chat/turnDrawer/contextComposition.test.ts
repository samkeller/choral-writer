import { describe, expect, it } from 'vitest';

import { compositionSegments, historyShare } from './contextComposition';

describe('context composition', () => {
  it('orders parts the same way whatever the recorded order, with their share of the total', () => {
    expect(compositionSegments([
      { part: 'input', estimatedTokens: 25 },
      { part: 'history', estimatedTokens: 50 },
      { part: 'systemPrompt', estimatedTokens: 25 },
    ])).toEqual([
      { part: 'systemPrompt', estimatedTokens: 25, share: 0.25 },
      { part: 'history', estimatedTokens: 50, share: 0.5 },
      { part: 'input', estimatedTokens: 25, share: 0.25 },
    ]);
    expect(compositionSegments([{ part: 'input', estimatedTokens: 0 }])).toEqual([]);
  });

  it('gives the share of the history, zero without history and null without composition', () => {
    expect(historyShare([{ part: 'history', estimatedTokens: 30 }, { part: 'input', estimatedTokens: 10 }])).toBe(0.75);
    expect(historyShare([{ part: 'input', estimatedTokens: 10 }])).toBe(0);
    expect(historyShare(null)).toBeNull();
  });
});
