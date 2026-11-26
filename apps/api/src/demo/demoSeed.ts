import { and, desc, eq, inArray, notExists } from 'drizzle-orm';
import type { ProjectAgent } from '@choral-writer/shared';

import type { Database, Transaction } from '../db/client.js';
import {
  agents, agentVersions, chatBranches, chatMessages, chatTurns, llmCall, llmUsage, memoryBanks, memoryRuns, memorySettings,
  projectAgents, projects,
} from '../db/schema.js';
import { DEFAULT_GUARDIAN_ID, DEFAULT_NARRATOR_ID } from '../modules/agents/repository/defaultNarrators.js';
import { buildDemoProjectRows, type DemoProjectRows, type RestitutionAgents } from './demoRows.js';
import { demoAgents, demoProjects } from './demoScenario.js';

export const DEMO_PROJECT_IDS = demoProjects.map((project) => project.id);
const DEMO_AGENT_IDS = demoAgents.map((agent) => agent.id);
const DAY_MS = 24 * 60 * 60_000;

export type DemoSeedReport = { id: string; name: string; turns: number }[];

/**
 * Replaces the demo projects, and only them, in one transaction: projects are identified by their
 * fixed ids, never by name. Demo agents still assigned to another project are kept as they are.
 */
export async function seedDemoProjects(database: Database, now = new Date()): Promise<DemoSeedReport> {
  return database.transaction(async (tx) => {
    await removeDemoData(tx);
    await insertDemoAgents(tx);
    const restitution = await restitutionAgents(tx);
    const report: DemoSeedReport = [];
    for (const [index, project] of demoProjects.entries()) {
      // Each project starts a few days ago so that its turns read as past activity.
      const startedAt = new Date(now.getTime() - (demoProjects.length - index + 1) * DAY_MS);
      await insertRows(tx, buildDemoProjectRows(project, restitution, startedAt));
      report.push({ id: project.id, name: project.name, turns: project.turns.length });
    }
    return report;
  });
}

/** Deletes the demo projects with everything they own, then the demo agents no other project uses. */
export async function clearDemoProjects(database: Database): Promise<void> {
  await database.transaction(removeDemoData);
}

async function removeDemoData(tx: Transaction): Promise<void> {
  // Cascades to branches, messages, turns, agent assignments, memory, LLM calls and usage.
  await tx.delete(projects).where(inArray(projects.id, DEMO_PROJECT_IDS));
  await tx.delete(agents).where(and(
    inArray(agents.id, DEMO_AGENT_IDS),
    notExists(tx.select({ agentId: projectAgents.agentId }).from(projectAgents).where(eq(projectAgents.agentId, agents.id))),
  ));
}

/** Published versions are immutable: an agent kept by another project keeps its versions as they are. */
async function insertDemoAgents(tx: Transaction): Promise<void> {
  await tx.insert(agents).values(demoAgents.map(({ id, phase, output }) => ({ id, phase, output }))).onConflictDoNothing();
  await tx.insert(agentVersions).values(demoAgents.flatMap((agent) => agent.versions.map((version, index) => ({
    id: version.id, agentId: agent.id, version: index + 1, name: version.name, instructions: version.instructions,
  })))).onConflictDoNothing();
}

async function restitutionAgents(tx: Transaction): Promise<RestitutionAgents> {
  const latest = async (agentId: string): Promise<ProjectAgent> => {
    const [row] = await tx.select({
      agentId: agents.id, phase: agents.phase, output: agents.output, versionId: agentVersions.id,
      version: agentVersions.version, name: agentVersions.name, instructions: agentVersions.instructions,
    }).from(agents).innerJoin(agentVersions, eq(agentVersions.agentId, agents.id))
      .where(eq(agents.id, agentId)).orderBy(desc(agentVersions.version)).limit(1);
    if (!row) throw new Error('Missing built-in agents; apply database migrations first.');
    return { ...row, memoryRead: { mode: 'all', tagIds: [] } };
  };
  return { narrator: await latest(DEFAULT_NARRATOR_ID), guardian: await latest(DEFAULT_GUARDIAN_ID) };
}

/** Branches, turns and the project reference each other: links are set once their targets exist. */
async function insertRows(tx: Transaction, rows: DemoProjectRows): Promise<void> {
  await tx.insert(projects).values({ ...rows.project, defaultBranchId: null });
  await tx.insert(chatBranches).values(rows.branches.map((branch) => ({ ...branch, forkTurnId: null, headTurnId: null })));
  await tx.insert(chatMessages).values(rows.messages);
  await tx.insert(chatTurns).values(rows.turns);
  for (const branch of rows.branches) {
    await tx.update(chatBranches).set({ forkTurnId: branch.forkTurnId, headTurnId: branch.headTurnId })
      .where(eq(chatBranches.id, branch.id));
  }
  await tx.update(projects).set({ defaultBranchId: rows.project.defaultBranchId }).where(eq(projects.id, rows.project.id));
  await tx.insert(projectAgents).values(rows.projectAgents);
  await tx.insert(memorySettings).values(rows.memorySettings);
  await tx.insert(memoryBanks).values(rows.memoryBanks);
  if (rows.memoryRuns.length) await tx.insert(memoryRuns).values(rows.memoryRuns);
  await tx.insert(llmCall).values(rows.llmCalls);
  if (rows.llmUsages.length) await tx.insert(llmUsage).values(rows.llmUsages);
}
