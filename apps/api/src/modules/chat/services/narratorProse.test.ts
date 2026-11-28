import { describe, expect, it } from 'vitest';

import { narratorProse } from './narratorProse.js';

describe('narratorProse', () => {
  it('returns a V2 response, the prose alone, unchanged', () => {
    expect(narratorProse('La porte grince.\n\nLe couloir reste vide.')).toBe('La porte grince.\n\nLe couloir reste vide.');
  });

  it('keeps only the prose of an MVP response, never its resolution', () => {
    const raw = '<resolution>Le garde s’endort.</resolution>\n<prose>\nLa porte grince.\n</prose>';

    expect(narratorProse(raw)).toBe('La porte grince.');
  });

  it('keeps the prose of an MVP response cut before its closing tag', () => {
    expect(narratorProse('<resolution>Le garde s’endort.</resolution><prose>La porte grin')).toBe('La porte grin');
  });

  it('never returns a resolution, even from a response without prose', () => {
    expect(narratorProse('<resolution>Le garde s’endort.</resolution>')).toBe('');
    expect(narratorProse('<resolution>Le garde s’end')).toBe('');
    expect(narratorProse('Texte libre. <resolution>Le garde s’endort.</resolution>')).toBe('Texte libre.');
  });
});
