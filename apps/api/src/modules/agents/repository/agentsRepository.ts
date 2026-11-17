import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { Agent, AgentInput, AgentVersionInput, ProjectAgent, ProjectAgentsInput } from '@choral-writer/shared';

import type { Database, Transaction } from '../../../db/client.js';
import { agents, agentVersions, projectAgents } from '../../../db/entities/agents/agent.js';
import { projects } from '../../../db/entities/project.js';
import { DEFAULT_GUARDIAN_ID, DEFAULT_NARRATOR_ID } from './defaultNarrators.js';

export class AgentRepository {
  constructor(private readonly database: Database | Transaction) {}

  async list(): Promise<Agent[]> {
    const [identities, versions, usages] = await Promise.all([
      this.database.select().from(agents).orderBy(desc(agents.createdAt), asc(agents.id)),
      this.database.select().from(agentVersions).orderBy(desc(agentVersions.version)),
      this.database.select({
        agentId: projectAgents.agentId, id: projects.id, name: projects.name,
        versionId: projectAgents.versionId,
      }).from(projectAgents).innerJoin(projects, eq(projects.id, projectAgents.projectId))
        .orderBy(asc(projects.name)),
    ]);
    return identities.map((agent) => ({
      ...agent, createdAt: agent.createdAt.toISOString(),
      versions: versions.filter((version) => version.agentId === agent.id).map((version) => ({
        id: version.id, name: version.name, instructions: version.instructions,
        version: version.version, createdAt: version.createdAt.toISOString(),
      })),
      projects: usages.filter((usage) => usage.agentId === agent.id).map(({ agentId: _id, ...usage }) => usage),
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

  async replace(projectId: string, selections: {
    agentId: string; versionId: string; phase: Agent['phase']; output: Agent['output'];
  }[]): Promise<void> {
    await this.database.delete(projectAgents).where(eq(projectAgents.projectId, projectId));
    if (selections.length > 0) {
      await this.database.insert(projectAgents).values(selections.map((selection) => ({ projectId, ...selection })));
    }
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

  async narratorInstructions(projectId: string): Promise<string> {
    const [row] = await this.database.select({ instructions: agentVersions.instructions })
      .from(projectAgents).innerJoin(agentVersions, eq(agentVersions.id, projectAgents.versionId))
      .where(and(eq(projectAgents.projectId, projectId), eq(projectAgents.output, 'narrative')));
    if (!row) throw new Error('Project has no narrator assignment.');
    return row.instructions;
  }
}
