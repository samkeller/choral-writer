import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { agentInputSchema } from '@choral-writer/shared';

import { LIBRARY_AGENTS, isBuiltInAgent } from './agentLibrary.js';
import { DEFAULT_GUARDIAN_ID, DEFAULT_NARRATOR_ID } from './defaultNarrators.js';

/**
 * Content of every published library version. A version is immutable once published:
 * to change an agent, append a new version and add its fingerprint here, never edit an entry.
 */
const PUBLISHED_FINGERPRINTS: Record<string, string> = {
  '019aee00-0000-7000-8000-000000000201': '2ae6979cbea7063a', // Continuité v1
  '019aee00-0000-7000-8000-000000000202': 'cac74bc5792d5040', // Personnages et Intentions v1
  '019aee00-0000-7000-8000-000000000203': '18c40e528b58ab22', // Hors champ v1
  '019aee00-0000-7000-8000-000000000204': '970d239f7547c1c0', // Dramaturgie v1
  '019aee00-0000-7000-8000-000000000205': 'c64fea172cd7ad5e', // Monde et règles v1
  '019aee00-0000-7000-8000-000000000206': '8b766906ad3c6646', // Directeur mesuré v1
  '019aee00-0000-7000-8000-000000000306': 'f351123cc17de835', // Directeur mesuré v2
  '019aee00-0000-7000-8000-000000000207': '2cdca890b366947a', // Directeur rythmé v1
  '019aee00-0000-7000-8000-000000000307': '6fc67e2fafe7d243', // Directeur rythmé v2
  '019aee00-0000-7000-8000-000000000208': '6eafa5075536118e', // Narrateur scénique v1
  '019aee00-0000-7000-8000-000000000308': '7d42246d565eb61f', // Narrateur scénique v2
  '019aee00-0000-7000-8000-000000000209': '553d60f085795299', // Gardien des Intentions v1
};

const fingerprint = (version: { name: string; instructions: string }) =>
  createHash('sha256').update(`${version.name}\n${version.instructions}`).digest('hex').slice(0, 16);

const allVersions = LIBRARY_AGENTS.flatMap((agent) => agent.versions.map((version) => ({ ...version, agent })));

describe('agent library', () => {
  it('publishes valid versions, numbered from 1 without gaps, with distinct identifiers', () => {
    for (const { agent, name, instructions } of allVersions) {
      expect(agentInputSchema.safeParse({ name, instructions, phase: agent.phase, output: agent.output }).success, name).toBe(true);
      expect(instructions.length, name).toBeGreaterThan(0);
    }
    for (const agent of LIBRARY_AGENTS) {
      expect(agent.versions.map((version) => version.version)).toEqual(agent.versions.map((_, index) => index + 1));
    }
    const ids = [...LIBRARY_AGENTS.map((agent) => agent.id), ...allVersions.map((version) => version.id)];
    expect(new Set([...ids, DEFAULT_NARRATOR_ID, DEFAULT_GUARDIAN_ID]).size).toBe(ids.length + 2);
    expect(new Set(LIBRARY_AGENTS.map((agent) => agent.versions.at(-1)!.name)).size).toBe(LIBRARY_AGENTS.length);
  });

  it('never changes the content of a published version', () => {
    expect(Object.fromEntries(allVersions.map((version) => [version.id, fingerprint(version)])),
      'A published library version was edited, or added without its fingerprint: publish a new version instead.')
      .toEqual(PUBLISHED_FINGERPRINTS);
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
