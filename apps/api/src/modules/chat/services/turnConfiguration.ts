import type { ProjectAgent, TurnConfiguration } from '@choral-writer/shared';

/** Freezes what a turn runs with; instructions are left out because agent versions are immutable. */
export function turnConfiguration(systemPrompt: string, agents: readonly ProjectAgent[]): TurnConfiguration {
  return {
    systemPrompt,
    agents: agents.map(({ agentId, versionId, version, name, phase, output, memoryRead }) => ({
      agentId, versionId, version, name, phase, output, memoryRead: memoryRead ?? null,
    })),
  };
}
