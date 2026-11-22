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
    const prompt = narratorSystemPrompt('Contexte du projet.', [], emptyMemory, null);

    expect(prompt.startsWith('Contexte du projet.\n\n')).toBe(true);
    expect(prompt).not.toContain('ANALYSES DES AGENTS');
    expect(prompt).not.toMatch(/<resolution>|<prose>/);
    expect(prompt).toContain('Ne termine jamais le tour par une question');
  });

  it('replaces the whiteboard with the direction and the retained contributions only, verbatim', () => {
    const kept = { kind: 'observation', text: 'Un fil est visible.', importance: 'HIGH' } as const;
    const dropped = { kind: 'idée', text: 'Un courant d’air.', importance: 'LOW' } as const;
    const whiteboard = [{ v: 1 as const, agent: 'Chaos', summary: 'Résumé.', items: [kept, dropped] }];

    const prompt = narratorSystemPrompt('Contexte.', whiteboard, emptyMemory, {
      tension: 'basculer',
      nudges: [{ type: 'complication', target: 'La tentative d’ouvrir la porte.', basis: null }],
      retained: [{ agent: 'Chaos', item: kept, why: 'Concret.' }],
      dismissed: [{ agent: 'Chaos', item: dropped, why: 'Bruit.' }],
    });

    expect(prompt).toContain('DIRECTION DU TOUR. Elle prime sur la saisie');
    expect(prompt).toContain('Ta prose reste d’abord une réponse à la saisie');
    expect(prompt).toContain('pas des faits');
    expect(prompt).toContain('Tension visée : faire basculer la scène.');
    expect(prompt).toContain('- complication (contrarier l’issue d’une tentative du protagoniste, jamais l’acte lui-même) : La tentative d’ouvrir la porte.');
    expect(prompt).toContain('## Chaos\n- observation (importance haute) : Un fil est visible.');
    expect(prompt).not.toContain('Un courant d’air.');
    expect(prompt).not.toContain('Concret.');
    expect(prompt).not.toContain('ANALYSES DES AGENTS');
  });
});
