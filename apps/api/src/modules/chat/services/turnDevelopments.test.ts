import type { AnalysisEnvelope } from '@choral-writer/shared';
import { describe, expect, it } from 'vitest';

import { turnDevelopments } from './turnDevelopments.js';

const scene = {
  kind: 'development', characters: ['Mara'], scope: 'scene', text: 'La lampe s’éteint.', importance: 'HIGH',
} as const;
const offscreen = {
  kind: 'development', characters: [], scope: 'offscreen', text: 'Un orage approche.', importance: 'LOW',
} as const;
const perspective = { kind: 'risque', text: 'La nuit tombe.', importance: 'NORMAL' } as const;
const whiteboard: AnalysisEnvelope[] = [
  { v: 1, agent: 'Monde', summary: 'Résumé.', items: [perspective, scene] },
  { v: 1, agent: 'Absents', summary: 'Résumé.', items: [offscreen] },
];

describe('turnDevelopments', () => {
  it('keeps every development, in both scopes, when no direction filtered the whiteboard', () => {
    expect(turnDevelopments(whiteboard, null)).toEqual([
      { agent: 'Monde', item: scene },
      { agent: 'Absents', item: offscreen },
    ]);
  });

  it('keeps only the developments the Director retained: a dismissed development does not happen', () => {
    expect(turnDevelopments(whiteboard, {
      tension: 'tenir', nudges: [],
      retained: [{ agent: 'Absents', item: offscreen, why: 'Pression du monde.' },
        { agent: 'Monde', item: perspective, why: 'Utile.' }],
      dismissed: [{ agent: 'Monde', item: scene, why: 'Trop tôt.' }],
    })).toEqual([{ agent: 'Absents', item: offscreen }]);
  });
});
