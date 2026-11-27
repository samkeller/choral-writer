import type { Project } from '@choral-writer/shared';

import { ApiError } from '../../../errors/errors.js';
import { AgentRepository } from '../../agents/repository/agentsRepository.js';
import { replaceProjectTeam } from '../../agents/services/agentSelection.js';
import { ProjectRepository } from '../../projects/repositories/projectRepository.js';
import type { ProjectsService } from '../../projects/services/projectServices.js';
import { ChatTurnRepository } from '../repositories/turnRepository.js';
import { ChatTurnService } from './turnService.js';

/**
 * « Adopter la variante » : the configuration a regenerated turn ran with becomes the project's, and the
 * story continues on its branch. Everything commits together, under the project lock, or nothing does.
 * Keeping the original needs no counterpart: it changes nothing.
 */
export class VariantAdoptionService {
  constructor(private readonly projects: Pick<ProjectsService, 'withLockedProject'>) {}

  adopt(projectId: string, turnId: string): Promise<Project> {
    return this.projects.withLockedProject(projectId, async (project, tx) => {
      const turns = new ChatTurnService(new ChatTurnRepository(tx, projectId));
      const variant = await turns.get(turnId);
      if (variant.regeneratedFromTurnId === null || variant.status !== 'completed') {
        throw new ApiError(409, 'TURN_NOT_VARIANT', 'Seule une variante terminée d’un tour peut être adoptée.');
      }
      const configuration = await turns.configuration(turnId);
      if (!configuration) {
        throw new ApiError(409, 'TURN_CONFIGURATION_UNRECORDED',
          'La configuration de cette variante n’a pas été enregistrée : elle ne peut pas être adoptée.');
      }

      await replaceProjectTeam(new AgentRepository(tx), projectId,
        configuration.agents.map(({ agentId, versionId }) => ({ agentId, versionId })));

      const repository = new ProjectRepository(tx);
      await repository.update(projectId, { name: project.name, systemPrompt: configuration.systemPrompt });
      return repository.setDefaultBranch(projectId, variant.originBranchId);
    });
  }
}
