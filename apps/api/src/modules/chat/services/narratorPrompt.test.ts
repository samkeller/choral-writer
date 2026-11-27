import { describe, expect, it } from 'vitest';

import type { AnalysisEnvelope, TurnDirection } from '@choral-writer/shared';

import { joinSections, measureComposition } from '../../../llm/contextComposition.js';
import { formatWhiteboard, narratorSystemSections } from './narratorPrompt.js';

const emptyMemory = { tags: [], entries: [] };

function narratorSystemPrompt(
  systemPrompt: string, whiteboard: readonly AnalysisEnvelope[], direction: TurnDirection | null,
): string {
  return joinSections(narratorSystemSections(systemPrompt, '', whiteboard, emptyMemory, direction));
}

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
    const prompt = narratorSystemPrompt('Contexte du projet.', [], null);

    expect(prompt.startsWith('Contexte du projet.\n\n')).toBe(true);
    expect(prompt).not.toContain('ANALYSES DES AGENTS');
    expect(prompt).not.toMatch(/<resolution>|<prose>/);
    expect(prompt).toContain('Ne termine jamais le tour par une question');
  });

  it('replaces the whiteboard with the direction and the retained contributions only, verbatim', () => {
    const kept = { kind: 'observation', text: 'Un fil est visible.', importance: 'HIGH' } as const;
    const dropped = { kind: 'idée', text: 'Un courant d’air.', importance: 'LOW' } as const;
    const whiteboard = [{ v: 1 as const, agent: 'Chaos', summary: 'Résumé.', items: [kept, dropped] }];

    const prompt = narratorSystemPrompt('Contexte.', whiteboard, {
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

describe('narratorSystemPrompt with developments', () => {
  const scene = {
    kind: 'development', characters: ['Mara'], scope: 'scene', text: 'La lampe s’éteint.', importance: 'HIGH',
  } as const;
  const offscreen = {
    kind: 'development', characters: ['Le facteur'], scope: 'offscreen', text: 'Le facteur quitte le village.', importance: 'NORMAL',
  } as const;
  const whiteboard = [{ v: 1 as const, agent: 'Monde', summary: 'Le soir tombe.', items: [scene, offscreen] }];

  it('gives the Narrator the scene developments and their rule, never the off-screen ones', () => {
    const prompt = narratorSystemPrompt('Contexte.', whiteboard, null);

    expect(prompt).toContain('- développement dans la scène (personnages : Mara ; importance haute) : La lampe s’éteint.');
    expect(prompt).toContain('DÉVELOPPEMENTS DANS LA SCÈNE');
    expect(prompt).toContain('ne les contredis pas');
    expect(prompt).not.toContain('Le facteur quitte le village.');
  });

  it('drops an off-screen development the Director retained', () => {
    const prompt = narratorSystemPrompt('Contexte.', whiteboard, {
      tension: 'tenir', nudges: [],
      retained: [{ agent: 'Monde', item: offscreen, why: 'Utile plus tard.' }],
      dismissed: [{ agent: 'Monde', item: scene, why: 'Trop tôt.' }],
    });

    expect(prompt).not.toContain('Le facteur quitte le village.');
    expect(prompt).not.toContain('La lampe s’éteint.');
    expect(prompt).not.toContain('DÉVELOPPEMENTS DANS LA SCÈNE');
    expect(prompt).toContain('Aucune contribution des agents n’est retenue à ce tour.');
  });
});

describe('narratorSystemSections', () => {
  it('tags each part of the Narrator system message, direction and retained contributions apart', () => {
    const kept = { kind: 'observation', text: 'Un fil est visible.', importance: 'HIGH' } as const;
    const sections = narratorSystemSections('Contexte.', 'Ton sobre.', [], emptyMemory, {
      tension: 'monter', nudges: [], retained: [{ agent: 'Chaos', item: kept, why: 'Concret.' }], dismissed: [],
    });

    expect(measureComposition(sections).map((entry) => entry.part))
      .toEqual(['systemPrompt', 'instructions', 'rules', 'direction', 'contributions']);
    expect(sections.find((section) => section.part === 'contributions')?.text).toContain('Un fil est visible.');
    expect(sections.find((section) => section.part === 'direction')?.text).toContain('Tension visée');
  });
});
