import type { Project, ProjectInput } from '@choral-writer/shared';
import type { Database, Transaction } from '../../../db/client.js';
import { ApiError, isLockConflict } from '../../../errors/errors.js';
import type { ChatBranchService } from '../../chat/services/branchService.js';
import { AgentRepository } from '../../agents/repository/agentsRepository.js';
import { ProjectRepository } from '../repositories/projectRepository.js';

type BranchesForTransaction = (tx: Transaction, projectId: string) => ChatBranchService;

/** Gère la configuration des projets et initialise atomiquement leur branche principale. */
export class ProjectsService {
  private readonly repository: ProjectRepository;

  constructor(
    private readonly database: Database,
    private readonly branchesForTransaction: BranchesForTransaction,
  ) {
    this.repository = new ProjectRepository(database);
  }

  async get(id: string): Promise<Project> {
    const project = await this.repository.find(id);
    if (!project) throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Ce projet n’existe pas.');
    return project;
  }

  list(): Promise<Project[]> {
    return this.repository.list();
  }

  async create(input: ProjectInput): Promise<Project> {
    return this.database.transaction(async (tx) => {
      const repository = new ProjectRepository(tx);
      const project = await repository.create(input);
      await new AgentRepository(tx).createDefaults(project.id);
      const branch = await this.branchesForTransaction(tx, project.id).createMain();
      return repository.setDefaultBranch(project.id, branch.id);
    });
  }

  update(id: string, input: ProjectInput): Promise<Project> {
    return this.withLockedProject(id, (_project, tx) => new ProjectRepository(tx).update(id, input));
  }

  remove(id: string): Promise<void> {
    return this.withLockedProject(id, (_project, tx) => new ProjectRepository(tx).remove(id));
  }

  /**
   * Partage le verrou avec les commandes du chat et les mutations du projet.
   * NOWAIT refuse un concurrent plutôt que d'attendre ; le résultat suit le commit.
   * Le callback et ses services doivent utiliser cette même transaction.
   */
  withLockedProject<T>(id: string, work: (project: Project, tx: Transaction) => Promise<T>): Promise<T> {
    return this.database.transaction(async (tx) => {
      let project: Project | null;
      try {
        project = await new ProjectRepository(tx).lock(id);
      } catch (error) {
        if (isLockConflict(error)) {
          throw new ApiError(409, 'PROJECT_BUSY', 'Un tour est en cours dans ce projet. Réessayez après sa fin.');
        }
        throw error;
      }
      if (!project) throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Ce projet n’existe pas.');
      return work(project, tx);
    });
  }

  /** Called inside withLockedProject so activity and chat changes commit together. */
  recordActivity(tx: Transaction, id: string, at: Date): Promise<void> {
    return new ProjectRepository(tx).recordActivity(id, at);
  }
}
