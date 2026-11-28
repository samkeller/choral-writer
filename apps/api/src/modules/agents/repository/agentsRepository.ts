import { and, asc, desc, eq, inArray, max } from 'drizzle-orm';
import { defaultMemoryRead, type MemoryRead } from '@choral-writer/shared';
import { v7 as uuidv7 } from 'uuid';
import type { Agent, AgentInput, AgentVersionInput, ProjectAgent, ProjectAgentsInput } from '@choral-writer/shared';

import type { Database, Transaction } from '../../../db/client.js';
import { agents, agentVersions, projectAgents } from '../../../db/entities/agents/agent.js';
import { projects } from '../../../db/entities/project.js';
import { LIBRARY_AGENTS, type LibraryAgent } from './agentLibrary.js';
import { DEFAULT_GUARDIAN_ID, DEFAULT_NARRATOR_ID } from './defaultNarrators.js';

export class AgentRepository {
  constructor(private readonly database: Database | Transaction) {}

  async list(): Promise<Agent[]> {
    const identities = await this.database.select().from(agents).orderBy(desc(agents.createdAt), asc(agents.id));
    const versions = await this.database.select().from(agentVersions).orderBy(desc(agentVersions.version));
    const usages = await this.database.select({
      agentId: projectAgents.agentId, id: projects.id, name: projects.name,
      versionId: projectAgents.versionId,
    }).from(projectAgents).innerJoin(projects, eq(projects.id, projectAgents.projectId))
      .orderBy(asc(projects.name));
    return identities.map((agent) => ({
      ...agent,
      versions: versions.filter((version) => version.agentId === agent.id),
      projects: usages.filter((usage) => usage.agentId === agent.id),
    }));
  }

  async create(input: AgentInput): Promise<string> {
    const id = uuidv7();
    await this.database.insert(agents).values({ id, phase: input.phase, output: input.output });
    await this.publish(id, 1, input);
    return id;
  }

  async lock(id: string): Promise<boolean> {
    const rows = await this.database.select({ id: agents.id }).from(agents)
      .where(eq(agents.id, id)).for('update');
    return rows.length > 0;
  }

  async latestVersion(id: string): Promise<number> {
    const [row] = await this.database.select({ version: agentVersions.version }).from(agentVersions)
      .where(eq(agentVersions.agentId, id)).orderBy(desc(agentVersions.version)).limit(1);
    if (!row) throw new Error('Agent has no published version.');
    return row.version;
  }

  async publish(agentId: string, version: number, input: AgentVersionInput): Promise<void> {
    await this.database.insert(agentVersions).values({
      id: uuidv7(), agentId, version, name: input.name, instructions: input.instructions,
    });
  }

  async used(id: string): Promise<boolean> {
    const rows = await this.database.select().from(projectAgents).where(eq(projectAgents.agentId, id)).limit(1);
    return rows.length > 0;
  }

  async remove(id: string): Promise<void> {
    await this.database.delete(agents).where(eq(agents.id, id));
  }

  async listForProject(projectId: string): Promise<ProjectAgent[]> {
    return this.database.select({
      agentId: projectAgents.agentId, versionId: projectAgents.versionId,
      phase: projectAgents.phase, output: projectAgents.output, version: agentVersions.version,
      name: agentVersions.name, instructions: agentVersions.instructions,
      memoryRead: projectAgents.memoryRead,
    }).from(projectAgents).innerJoin(agentVersions, eq(agentVersions.id, projectAgents.versionId))
      .where(eq(projectAgents.projectId, projectId))
      .orderBy(asc(projectAgents.phase), asc(agentVersions.name), asc(projectAgents.agentId));
  }

  async resolveSelections(selections: ProjectAgentsInput['agents']) {
    if (selections.length === 0) return [];
    return this.database.select({
      agentId: agents.id, phase: agents.phase, output: agents.output, versionId: agentVersions.id,
    }).from(agents).innerJoin(agentVersions, eq(agentVersions.agentId, agents.id))
      .where(inArray(agentVersions.id, selections.map((selection) => selection.versionId)))
      .for('key share');
  }

  /** Resolves versions as a pipeline would run them, without assigning them to the project. */
  async resolveProjectAgents(projectId: string, selections: ProjectAgentsInput['agents']): Promise<ProjectAgent[]> {
    if (selections.length === 0) return [];
    const versions = await this.database.select({
      agentId: agents.id, versionId: agentVersions.id, phase: agents.phase, output: agents.output,
      version: agentVersions.version, name: agentVersions.name, instructions: agentVersions.instructions,
    }).from(agents).innerJoin(agentVersions, eq(agentVersions.agentId, agents.id))
      .where(inArray(agentVersions.id, selections.map((selection) => selection.versionId)))
      .orderBy(asc(agents.phase), asc(agentVersions.name), asc(agents.id))
      .for('key share');
    const current = await this.listForProject(projectId);
    return versions.map((version) => ({ ...version, memoryRead: memoryReadFor(current, version) }));
  }

  async replace(projectId: string, selections: {
    agentId: string; versionId: string; phase: Agent['phase']; output: Agent['output'];
  }[]): Promise<void> {
    const previous = await this.listForProject(projectId);
    await this.database.delete(projectAgents).where(eq(projectAgents.projectId, projectId));
    if (selections.length > 0) {
      await this.database.insert(projectAgents).values(selections.map((selection) => ({
        projectId, ...selection,
        memoryRead: memoryReadFor(previous, selection),
      })));
    }
  }

  async setMemoryRead(projectId: string, agentId: string, memoryRead: MemoryRead): Promise<boolean> {
    const rows = await this.database.update(projectAgents).set({ memoryRead }).where(and(
      eq(projectAgents.projectId, projectId), eq(projectAgents.agentId, agentId),
    )).returning({ id: projectAgents.agentId });
    return rows.length === 1;
  }

  async createDefaults(projectId: string): Promise<void> {
    const versions = await this.database.selectDistinctOn([agents.id], {
      agentId: agents.id, phase: agents.phase, output: agents.output, versionId: agentVersions.id,
    }).from(agents).innerJoin(agentVersions, eq(agentVersions.agentId, agents.id))
      .where(inArray(agents.id, [DEFAULT_NARRATOR_ID, DEFAULT_GUARDIAN_ID]))
      .orderBy(asc(agents.id), desc(agentVersions.version));
    if (versions.length !== 2) throw new Error('Missing built-in agents; apply database migrations.');
    await this.replace(projectId, versions);
  }

  /**
   * Adds the library agents and versions a database lacks. A missing version takes its agent's first free
   * number: users may publish versions of a library agent, so a library version is known by its fixed
   * identifier and its content, never by its number. A seeded version whose stored content differs from
   * the library fails, since a published version is immutable.
   */
  async ensureLibrary(library: readonly LibraryAgent[] = LIBRARY_AGENTS): Promise<void> {
    const agentIds = library.map((agent) => agent.id);
    const versions = library.flatMap((agent) => agent.versions.map((version) => ({ ...version, agent })));
    await this.database.insert(agents)
      .values(library.map(({ id, phase, output }) => ({ id, phase, output })))
      .onConflictDoNothing({ target: agents.id });
    // Locked as a publication locks its agent, so that no version number is taken meanwhile.
    await this.database.select({ id: agents.id }).from(agents)
      .where(inArray(agents.id, agentIds)).orderBy(asc(agents.id)).for('update');
    const stored = await this.database.select({
      id: agentVersions.id, agentId: agentVersions.agentId,
      name: agentVersions.name, instructions: agentVersions.instructions, phase: agents.phase, output: agents.output,
    }).from(agentVersions).innerJoin(agents, eq(agents.id, agentVersions.agentId))
      .where(inArray(agentVersions.id, versions.map((version) => version.id)));
    const diverging = versions.filter(({ id, agent, name, instructions }) => {
      const row = stored.find((item) => item.id === id);
      return row && (row.agentId !== agent.id || row.name !== name || row.instructions !== instructions
        || row.phase !== agent.phase || row.output !== agent.output);
    });
    if (diverging.length > 0) {
      throw new Error(`Library agent versions differ from the stored ones: ${diverging.map((version) => version.id).join(', ')}. Publish a new version instead of editing one.`);
    }
    const highest = await this.database.select({ agentId: agentVersions.agentId, version: max(agentVersions.version) })
      .from(agentVersions).where(inArray(agentVersions.agentId, agentIds)).groupBy(agentVersions.agentId);
    for (const agent of library) {
      let next = (highest.find((row) => row.agentId === agent.id)?.version ?? 0) + 1;
      const missing = agent.versions.filter((version) => !stored.some((row) => row.id === version.id));
      if (missing.length === 0) continue;
      await this.database.insert(agentVersions).values(missing.map(({ id, name, instructions }) => (
        { id, agentId: agent.id, version: next++, name, instructions })));
    }
  }
}

/** An agent keeps the memory access it has in the project; a newcomer gets its output's default. */
function memoryReadFor(
  current: readonly ProjectAgent[], agent: { agentId: string; output: Agent['output'] },
): MemoryRead {
  return current.find((item) => item.agentId === agent.agentId)?.memoryRead ?? defaultMemoryRead(agent.output);
}
