import { desc, eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { Project, ProjectInput } from '@choral-writer/shared';
import { Database, Transaction } from '../../../db/client.js';
import { projects } from '../../../db/entities/project.js';

function projectDto(row: typeof projects.$inferSelect): Project {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export class ProjectRepository {
  constructor(private readonly database: Database | Transaction) {}

  async find(id: string): Promise<Project | null> {
    const [row] = await this.database.select().from(projects).where(eq(projects.id, id));
    return row ? projectDto(row) : null;
  }

  async list(): Promise<Project[]> {
    const rows = await this.database.select().from(projects).orderBy(desc(projects.updatedAt), desc(projects.id));
    return rows.map(projectDto);
  }

  async create(input: ProjectInput): Promise<Project> {
    const [row] = await this.database.insert(projects).values({ id: uuidv7(), ...input }).returning();
    return projectDto(row);
  }

  async setDefaultBranch(id: string, defaultBranchId: string): Promise<Project> {
    const [row] = await this.database.update(projects).set({ defaultBranchId })
      .where(eq(projects.id, id)).returning();
    if (!row) throw new Error('Missing project while initializing its default branch.');
    return projectDto(row);
  }

  async update(id: string, input: ProjectInput): Promise<Project> {
    const [row] = await this.database.update(projects).set({ ...input, updatedAt: new Date() })
      .where(eq(projects.id, id)).returning();
    if (!row) throw new Error('Missing locked project while updating its configuration.');
    return projectDto(row);
  }

  async remove(id: string): Promise<void> {
    await this.database.delete(projects).where(eq(projects.id, id));
  }

  async recordActivity(id: string, at: Date): Promise<void> {
    const [row] = await this.database.update(projects).set({ updatedAt: at })
      .where(eq(projects.id, id)).returning({ id: projects.id });
    if (!row) throw new Error('Missing locked project while recording its activity.');
  }

  async lock(id: string): Promise<Project | null> {
    const [row] = await this.database.select().from(projects).where(eq(projects.id, id))
      .for('update', { noWait: true });
    return row ? projectDto(row) : null;
  }
}
