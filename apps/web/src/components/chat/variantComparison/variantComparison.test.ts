import { describe, expect, it } from 'vitest';
import type { TurnAttribution, TurnConfiguration } from '@choral-writer/shared';

import { agentVerdicts, configurationBadges, overallVerdict, wordCount } from './variantComparison';

const agent = (agentId: string, name: string, version: number): TurnConfiguration['agents'][number] => ({
  agentId, versionId: `${agentId}-v${version}`, name, version, phase: 'analysis', output: 'envelope', memoryRead: null,
});

const original: TurnConfiguration = {
  systemPrompt: 'Prompt A', agents: [agent('narrator', 'Narrateur', 1), agent('rhythm', 'Rythme', 1), agent('chaos', 'Chaos', 1)],
};
const variant: TurnConfiguration = {
  systemPrompt: 'Prompt B', agents: [agent('narrator', 'Narrateur', 1), agent('rhythm', 'Rythme', 2), agent('world', 'Monde', 1)],
};

describe('configurationBadges', () => {
  it('colors each element of a version against the other one', () => {
    expect(configurationBadges(variant, original, 'variant').map(({ label, change }) => [label, change])).toEqual([
      ['Narrateur v1', 'same'], ['Rythme v2', 'changed'], ['Monde v1', 'added'], ['Prompt du projet', 'changed'],
    ]);
    expect(configurationBadges(original, variant, 'original').map(({ label, change }) => [label, change])).toEqual([
      ['Narrateur v1', 'same'], ['Rythme v1', 'changed'], ['Chaos v1', 'removed'], ['Prompt du projet', 'changed'],
    ]);
  });

  it('tells nothing apart in a configuration compared with itself', () => {
    expect(configurationBadges(original, original, 'variant').every((badge) => badge.change === 'same')).toBe(true);
  });

  it('claims no equality when the other configuration was not recorded', () => {
    expect(configurationBadges(variant, null, 'variant').every((badge) => badge.change === 'unknown')).toBe(true);
  });
});

describe('agentVerdicts', () => {
  const contribution = (agentName: string, verdict: 'retenu' | 'partiel' | 'absent') => ({
    agent: agentName, item: { kind: 'suggestion' as const, text: 'Une idée générique.', importance: 'NORMAL' as const },
    verdict, note: '',
  });
  const attribution: TurnAttribution = {
    whatHappened: 'Un résumé générique.', callId: '019ad30c-19b0-7000-8000-000000000001', createdAt: '2025-01-01T00:00:00.000Z',
    contributions: [contribution('Chaos', 'retenu'), contribution('Monde', 'absent'), contribution('Chaos', 'absent')],
  };

  it('counts the verdicts of each agent in reading order and sums them up', () => {
    const verdicts = agentVerdicts(attribution);
    expect(verdicts).toEqual([
      { agent: 'Chaos', counts: { retenu: 1, partiel: 0, absent: 1 } },
      { agent: 'Monde', counts: { retenu: 0, partiel: 0, absent: 1 } },
    ]);
    expect(verdicts.map(overallVerdict)).toEqual(['partiel', 'absent']);
    expect(overallVerdict({ agent: 'Rythme', counts: { retenu: 2, partiel: 0, absent: 0 } })).toBe('retenu');
  });
});

describe('wordCount', () => {
  it('counts words across lines and paragraphs', () => {
    expect(wordCount('  Un deux\n\ntrois  quatre ')).toBe(4);
    expect(wordCount('')).toBe(0);
    expect(wordCount('# Titre\n\n- un *mot*\n\n***\n\n> 2 fois')).toBe(5);
  });
});
