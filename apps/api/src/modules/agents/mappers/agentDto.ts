import type { Agent, AgentDto } from '@choral-writer/shared';

export function toAgentDto(agent: Agent): AgentDto {
  return {
    id: agent.id,
    phase: agent.phase,
    output: agent.output,
    createdAt: agent.createdAt.toISOString(),
    versions: agent.versions.map((version) => ({
      id: version.id,
      name: version.name,
      instructions: version.instructions,
      version: version.version,
      createdAt: version.createdAt.toISOString(),
    })),
    projects: agent.projects.map((project) => ({
      id: project.id,
      name: project.name,
      versionId: project.versionId,
    })),
  };
}
