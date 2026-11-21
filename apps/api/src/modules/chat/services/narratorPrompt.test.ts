import { describe, expect, it } from 'vitest';

import { formatWhiteboard, narratorSystemPrompt } from './narratorPrompt.js';

const emptyMemory = { tags: [], entries: [] };

describe('narratorSystemPrompt', () => {
  it('renders the whiteboard as readable text rather than raw JSON', () => {
    const text = formatWhiteboard([{
      v: 1, agent: 'Chaos', summary: 'La porte est piégée.',
      items: [{ kind: 'observation', text: 'Un fil est visible.', importance: 'HIGH' }],
    }]);

    expect(text).toContain('## Chaos\nLa porte est piégée.\n- observation (importance haute) : Un fil est visible.');
    expect(text).not.toContain('{');
  });

  it('omits an empty whiteboard and asks for prose only, never ending on a question to the protagonist', () => {
    const prompt = narratorSystemPrompt('Contexte du projet.', [], emptyMemory);

    expect(prompt.startsWith('Contexte du projet.\n\n')).toBe(true);
    expect(prompt).not.toContain('ANALYSES DES AGENTS');
    expect(prompt).not.toMatch(/<resolution>|<prose>/);
    expect(prompt).toContain('Ne termine jamais le tour par une question');
  });
});
