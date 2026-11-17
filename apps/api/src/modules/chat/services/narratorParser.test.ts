import { describe, expect, it, vi } from 'vitest';

import { NarratorStreamParser } from './narratorParser.js';

describe('NarratorStreamParser', () => {
  it('streams only prose when section tags arrive in partial chunks', async () => {
    const deltas: string[] = [];
    const parser = new NarratorStreamParser(async (delta) => { deltas.push(delta); });
    const chunks = [
      '<resol',
      'ution>Facts only.</resolu',
      'tion><pro',
      'se>Visible ',
      'story.</prose>',
    ];

    for (const chunk of chunks) await parser.push(chunk);

    expect(deltas.join('')).toBe('Visible story.');
    expect(deltas.join('')).not.toContain('Facts only.');
    expect(parser.finish(chunks.join(''))).toEqual({
      resolution: 'Facts only.',
      prose: 'Visible story.',
    });
  });

  it('accepts whitespace between the resolution and prose sections', async () => {
    const deltas: string[] = [];
    const parser = new NarratorStreamParser(async (delta) => { deltas.push(delta); });
    const chunks = [
      '<resolution>Facts only.</resolution>\n  ',
      '<pro',
      'se>Visible story.</prose>',
    ];
    const response = chunks.join('');

    for (const chunk of chunks) await parser.push(chunk);

    expect(deltas.join('')).toBe('Visible story.');
    expect(parser.finish(response)).toEqual({
      resolution: 'Facts only.',
      prose: 'Visible story.',
    });
  });

  it('rejects malformed or incomplete sections', async () => {
    const parser = new NarratorStreamParser(vi.fn(async () => {}));
    const response = '<resolution>Facts only</resolution><prose>Missing close';
    await parser.push(response);

    expect(() => parser.finish(response)).toThrow('Narrator response must contain non-empty resolution and prose sections.');
  });

  it('rejects content outside the tagged sections', async () => {
    const parser = new NarratorStreamParser(vi.fn(async () => {}));

    await expect(parser.push('Unexpected text')).rejects.toThrow('Narrator response is missing <resolution>.');
  });
});
