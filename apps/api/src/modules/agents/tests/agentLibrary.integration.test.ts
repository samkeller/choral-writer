import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq } from 'drizzle-orm';

import * as schema from '../../../db/schema.js';
import { createTestPool } from '../../../tests/testDb.js';
import { createChatBranchService } from '../../chat/index.js';
import { ProjectsService } from '../../projects/services/projectServices.js';
import { MemoryRepository } from '../../memories/repositories/memoryRepository.js';
import { AgentsService } from '../services/agentsService.js';
import { LIBRARY_AGENTS } from '../repository/agentLibrary.js';

// Only run against an explicitly supplied disposable PostgreSQL database.
describe.skipIf(!process.env.DATABASE_URL)('agent library and starting tags with PostgreSQL', () => {
  const pool = createTestPool();
  const database = drizzle(pool, { schema });
  const projects = new ProjectsService(database, createChatBranchService);
  const agents = new AgentsService(database, projects);
  const createdIds: string[] = [];

  beforeAll(async () => {
    await migrate(database, { migrationsFolder: './src/db/migrations', migrationsSchema: 'choral_writer' });
  }, 15_000);

  afterAll(async () => {
    for (const id of createdIds) await database.delete(schema.projects).where(eq(schema.projects.id, id));
    await pool.end();
  });

  async function createProject(name: string) {
    const project = await projects.create({ name, systemPrompt: 'Un monde de test.' });
    createdIds.push(project.id);
    return project;
  }

  it('seeds every library version once and keeps its agents in the library', async () => {
    await agents.ensureLibrary();
    await agents.ensureLibrary();
    const library = (await agents.list()).filter((agent) => LIBRARY_AGENTS.some((item) => item.id === agent.id));
    expect(library).toHaveLength(LIBRARY_AGENTS.length);
    for (const expected of LIBRARY_AGENTS) {
      const agent = library.find((item) => item.id === expected.id)!;
      expect(agent).toMatchObject({ phase: expected.phase, output: expected.output });
      expect(agent.versions.map(({ id, version, name, instructions }) => ({ id, version, name, instructions })))
        .toEqual([...expected.versions].reverse());
    }
    await expect(agents.remove(LIBRARY_AGENTS[0]!.id)).rejects.toMatchObject({ code: 'AGENT_IN_USE' });
  });

  it('lets a project enable a library Director, which keeps its pinned version when the library grows', async () => {
    await agents.ensureLibrary();
    const project = await createProject('Bibliothèque');
    const team = await agents.listForProject(project.id);
    const director = LIBRARY_AGENTS.find((agent) => agent.output === 'direction' && agent.versions.length > 1)!;
    const pinned = director.versions[0]!.id;
    const configured = await agents.configure(project.id, { agents: [
      ...team.map(({ agentId, versionId }) => ({ agentId, versionId })),
      { agentId: director.id, versionId: pinned },
    ] });
    expect(configured.find((agent) => agent.agentId === director.id))
      .toMatchObject({ phase: 'direction', output: 'direction', versionId: pinned, memoryRead: { mode: 'none', tagIds: [] } });
    await agents.ensureLibrary();
    expect((await agents.listForProject(project.id)).find((agent) => agent.agentId === director.id)?.versionId).toBe(pinned);
  });

  it('creates every project with the starting tags and memory switched on', async () => {
    const project = await createProject('Tags de départ');
    const view = await new MemoryRepository(database, project.id).view(project.defaultBranchId!);
    expect(view?.enabled).toBe(true);
    expect(view?.state.tags.map((tag) => tag.name)).toEqual(['Faits', 'Monde', 'Intentions', 'Fils ouverts']);
    expect(view?.state.entries).toEqual([]);
    const other = await createProject('Autres tags');
    const otherView = await new MemoryRepository(database, other.id).view(other.defaultBranchId!);
    expect(otherView?.state.tags.map((tag) => tag.id)).not.toEqual(view?.state.tags.map((tag) => tag.id));
  });
});
