import type { Project, ProjectDto } from '@choral-writer/shared';

export function toProjectDto(project: Project): ProjectDto {
  return {
    id: project.id,
    name: project.name,
    systemPrompt: project.systemPrompt,
    defaultBranchId: project.defaultBranchId,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}
