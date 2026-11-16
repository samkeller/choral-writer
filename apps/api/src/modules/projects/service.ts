import { desc, eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { Project, ProjectInput } from '@choral-writer/shared';

import type { Database, Transaction } from '../../db/client.js';
import { projects } from '../../db/entities/project.js';
import { ApiError, isLockConflict } from '../../errors.js';

export function projectDto(row: typeof projects.$inferSelect): Project {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export async function lockProject(tx: Transaction, id: string) {
  try {
    const [project] = await tx.select().from(projects).where(eq(projects.id, id))
      .for('update', { noWait: true });
    if (!project) throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Ce projet n’existe pas.');
    return project;
  } catch (error) {
    if (isLockConflict(error)) {
      throw new ApiError(409, 'PROJECT_BUSY', 'Un tour est en cours dans ce projet. Réessayez après sa fin.');
    }
    throw error;
  }
}

export function createProjectsService(database: Database) {
  async function get(id: string): Promise<Project> {
    const [row] = await database.select().from(projects).where(eq(projects.id, id));
    if (!row) throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Ce projet n’existe pas.');
    return projectDto(row);
  }

  return {
    get,
    async list(): Promise<Project[]> {
      const rows = await database.select().from(projects).orderBy(desc(projects.updatedAt), desc(projects.id));
      return rows.map(projectDto);
    },
    async create(input: ProjectInput): Promise<Project> {
      const [row] = await database.insert(projects).values({ id: uuidv7(), ...input }).returning();
      return projectDto(row);
    },
    async update(id: string, input: ProjectInput): Promise<Project> {
      return database.transaction(async (tx) => {
        await lockProject(tx, id);
        const [row] = await tx.update(projects).set({ ...input, updatedAt: new Date() })
          .where(eq(projects.id, id)).returning();
        return projectDto(row);
      });
    },
    async remove(id: string): Promise<void> {
      await database.transaction(async (tx) => {
        await lockProject(tx, id);
        await tx.delete(projects).where(eq(projects.id, id));
      });
    },
  };
}

export type ProjectsService = ReturnType<typeof createProjectsService>;
