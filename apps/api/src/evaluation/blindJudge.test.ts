import { describe, expect, it } from 'vitest';

import {
  anonymize, combinePasses, deanonymize, judgeMessages, judgeVerdictSchema, swapped, type JudgeVerdict, type SideVerdict,
} from './blindJudge.js';

const stories = { v1: ['prose de la première configuration'], v2: ['prose de la seconde configuration'] };

function verdict(winner: 'A' | 'B' | 'egalite'): JudgeVerdict {
  const criterion = { winner, why: 'Parce que.' };
  return { v: 1, criteria: { resistance: criterion, horsChamp: criterion, nonLineaire: criterion, continuite: criterion } };
}

describe('blind judge anonymization', () => {
  it('presents the sides in an order drawn at random, and keeps the key out of the presentation', () => {
    expect(anonymize(stories, () => 0.1)).toEqual({ presented: { A: stories.v1, B: stories.v2 }, key: { A: 'v1', B: 'v2' } });
    expect(anonymize(stories, () => 0.9)).toEqual({ presented: { A: stories.v2, B: stories.v1 }, key: { A: 'v2', B: 'v1' } });
  });

  it('swaps both the presentation and the key', () => {
    expect(swapped(anonymize(stories, () => 0.1))).toEqual({ presented: { A: stories.v2, B: stories.v1 }, key: { A: 'v2', B: 'v1' } });
  });

  it('gives the judge only letters, never the configurations', () => {
    const prompt = judgeMessages(['Une saisie.'], anonymize(stories, () => 0.9).presented)
      .map((message) => String(message.content)).join('\n');
    expect(prompt).toContain('## Version A\n\n### Tour 1\nprose de la seconde configuration');
    expect(prompt).not.toMatch(/\bV[12]\b|v1|v2|Directeur|type V1/);
  });

  it('marks a failed turn instead of leaving a hole in the story', () => {
    const prompt = String(judgeMessages(['Une saisie.'], { A: [null], B: ['prose'] })[1]?.content);
    expect(prompt).toContain('(Tour en échec : aucune prose.)');
  });
});

describe('blind judge verdicts', () => {
  it('maps each letter back to its configuration, ties included', () => {
    const result = deanonymize({ ...verdict('A'), criteria: { ...verdict('A').criteria, continuite: { winner: 'egalite', why: 'Pareil.' } } },
      { A: 'v2', B: 'v1' });
    expect(result.resistance).toEqual({ winner: 'v2', why: 'Parce que.' });
    expect(result.continuite).toEqual({ winner: 'egalite', why: 'Pareil.' });
  });

  it('decides a criterion only when both orders agree', () => {
    const first: SideVerdict = deanonymize(verdict('B'), { A: 'v1', B: 'v2' });
    const agreeing = deanonymize(verdict('A'), { A: 'v2', B: 'v1' });
    const positional = deanonymize(verdict('B'), { A: 'v2', B: 'v1' });
    expect(combinePasses([first, agreeing]).resistance).toBe('v2');
    expect(combinePasses([first, positional]).resistance).toBe('incertain');
    expect(combinePasses([deanonymize(verdict('egalite'), { A: 'v1', B: 'v2' }), deanonymize(verdict('egalite'), { A: 'v2', B: 'v1' })])
      .horsChamp).toBe('egalite');
  });

  it('accepts only the four criteria with a known winner', () => {
    expect(judgeVerdictSchema.safeParse(verdict('A')).success).toBe(true);
    expect(judgeVerdictSchema.safeParse({ ...verdict('A'), criteria: { ...verdict('A').criteria, autre: { winner: 'A', why: 'x' } } }).success)
      .toBe(false);
    expect(judgeVerdictSchema.safeParse({ ...verdict('A'), criteria: { ...verdict('A').criteria, resistance: { winner: 'C', why: 'x' } } }).success)
      .toBe(false);
  });
});
