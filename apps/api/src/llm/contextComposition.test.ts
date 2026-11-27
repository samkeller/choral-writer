import { describe, expect, it } from 'vitest';
import { CONTEXT_CHARS_PER_TOKEN } from '@choral-writer/shared';

import { estimateTokens, joinSections, measureComposition } from './contextComposition.js';

describe('context composition', () => {
  it('estimates tokens from the length of the text, rounding up', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('a')).toBe(1);
    expect(estimateTokens('a'.repeat(CONTEXT_CHARS_PER_TOKEN * 3))).toBe(3);
  });

  it('adds up sections of the same part in order of first appearance and leaves empty parts out', () => {
    expect(measureComposition([
      { part: 'systemPrompt', text: 'a'.repeat(40) },
      { part: 'instructions', text: '' },
      { part: 'history', text: 'b'.repeat(20) },
      { part: 'history', text: 'c'.repeat(20) },
      { part: 'input', text: 'd'.repeat(8) },
    ])).toEqual([
      { part: 'systemPrompt', estimatedTokens: 10 },
      { part: 'history', estimatedTokens: 10 },
      { part: 'input', estimatedTokens: 2 },
    ]);
  });

  it('joins the non-empty sections as a prompt reads them', () => {
    expect(joinSections([
      { part: 'systemPrompt', text: 'Projet.' }, { part: 'instructions', text: '' }, { part: 'rules', text: 'Règles.' },
    ])).toBe('Projet.\n\nRègles.');
  });
});
