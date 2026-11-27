import { describe, expect, it } from 'vitest';
import type { Agent } from '@choral-writer/shared';

import { addAgent, removeAgent } from './useAgentTeam';

const createdAt = new Date('2026-11-16T08:00:00.000Z');
function agent(id: string, output: Agent['output'], versions = 1): Agent {
  return {
    id, output, createdAt, projects: [],
    phase: output === 'envelope' ? 'analysis' : output === 'direction' ? 'direction' : 'restitution',
    versions: Array.from({ length: versions }, (_, index) => ({
      id: `${id}-v${versions - index}`, version: versions - index, name: id, instructions: '', createdAt,
    })),
  };
}

const narrator = agent('narrator', 'narrative');
const otherNarrator = agent('other-narrator', 'narrative');
const guardian = agent('guardian', 'memory_proposals');
const observer = agent('observer', 'envelope', 2);
const skeptic = agent('skeptic', 'envelope');
const director = agent('director', 'direction');
const otherDirector = agent('other-director', 'direction');
const library = [narrator, otherNarrator, guardian, observer, skeptic, director, otherDirector];
const team = ['narrator-v1', 'guardian-v1', 'director-v1', 'observer-v1'];

describe('team composition rules', () => {
  it('adds analysis agents alongside the others, with their latest version', () => {
    expect(addAgent(team, library, skeptic)).toEqual([...team, 'skeptic-v1']);
  });

  it('keeps the retained version of an agent already in the team', () => {
    expect(addAgent(team, library, observer)).toBe(team);
  });

  it('replaces the Narrator or the Director in place, so each stays unique', () => {
    expect(addAgent(team, library, otherNarrator)).toEqual(['other-narrator-v1', 'guardian-v1', 'director-v1', 'observer-v1']);
    expect(addAgent(team, library, otherDirector)).toEqual(['narrator-v1', 'guardian-v1', 'other-director-v1', 'observer-v1']);
  });

  it('removes every version of an agent, leaving a team without Director possible', () => {
    expect(removeAgent(team, director)).toEqual(['narrator-v1', 'guardian-v1', 'observer-v1']);
    expect(addAgent(removeAgent(team, director), library, otherDirector)).toEqual(
      ['narrator-v1', 'guardian-v1', 'observer-v1', 'other-director-v1']);
  });
});
