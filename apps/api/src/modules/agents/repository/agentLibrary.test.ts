import { describe, expect, it } from 'vitest';
import { agentInputSchema } from '@choral-writer/shared';

import { LIBRARY_AGENTS, isBuiltInAgent } from './agentLibrary.js';
import { DEFAULT_GUARDIAN_ID, DEFAULT_NARRATOR_ID } from './defaultNarrators.js';

describe('agent library', () => {
  it('publishes valid agents, distinct by identifier, version and name', () => {
    for (const { id, versionId, ...input } of LIBRARY_AGENTS) {
      expect(agentInputSchema.safeParse(input).success, input.name).toBe(true);
      expect(input.instructions.length, input.name).toBeGreaterThan(0);
    }
    const ids = LIBRARY_AGENTS.flatMap((agent) => [agent.id, agent.versionId]);
    expect(new Set([...ids, DEFAULT_NARRATOR_ID, DEFAULT_GUARDIAN_ID]).size).toBe(ids.length + 2);
    expect(new Set(LIBRARY_AGENTS.map((agent) => agent.name)).size).toBe(LIBRARY_AGENTS.length);
  });

  it('offers, with the built-in Narrator and Guardian, several agents for every role', () => {
    const count = (output: string) => LIBRARY_AGENTS.filter((agent) => agent.output === output).length;
    expect(count('envelope')).toBe(5);
    expect(count('direction')).toBe(2);
    expect(count('narrative') + 1).toBe(2);
    expect(count('memory_proposals') + 1).toBe(2);
  });

  it('treats library and built-in agents as provided by the application', () => {
    expect(LIBRARY_AGENTS.every((agent) => isBuiltInAgent(agent.id))).toBe(true);
    expect(isBuiltInAgent(DEFAULT_NARRATOR_ID)).toBe(true);
    expect(isBuiltInAgent('019aee00-0000-7000-8000-0000000009ff')).toBe(false);
  });
});
