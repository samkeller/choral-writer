import { describe, expect, it } from 'vitest';
import type { TurnConfiguration } from '@choral-writer/shared';

import { turnConfigurationChanges } from './configurationChanges.js';

type ConfiguredAgent = TurnConfiguration['agents'][number];

function agent(id: string, version: number, name = `Agent ${id}`): ConfiguredAgent {
  return {
    agentId: `019ad30c-19b0-7000-8000-00000000030${id}`,
    versionId: `019ad30c-19b0-7000-8000-0000000004${id}${version}`,
    version, name, phase: 'analysis', output: 'envelope', memoryRead: { mode: 'all', tagIds: [] },
  };
}

describe('turnConfigurationChanges', () => {
  it('finds nothing between identical configurations', () => {
    const configuration = { systemPrompt: 'Prompt.', agents: [agent('1', 1)] };
    expect(turnConfigurationChanges(configuration, structuredClone(configuration))).toEqual([]);
  });

  it('lists the prompt change, then added, upgraded and removed agents', () => {
    const previous = { systemPrompt: 'Prompt.', agents: [agent('1', 1, 'Rythme'), agent('2', 1, 'Monde')] };
    const current = { systemPrompt: 'Prompt revu.', agents: [agent('1', 2, 'Rythme'), agent('3', 1, 'Cohérence')] };

    expect(turnConfigurationChanges(previous, current)).toEqual([
      { kind: 'systemPromptChanged' },
      { kind: 'agentChanged', name: 'Rythme', fromVersion: 1, toVersion: 2 },
      { kind: 'agentAdded', name: 'Cohérence', version: 1 },
      { kind: 'agentRemoved', name: 'Monde', version: 1 },
    ]);
  });
});
