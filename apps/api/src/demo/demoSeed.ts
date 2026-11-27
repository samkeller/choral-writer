import { eq, inArray } from 'drizzle-orm';

import type { Database, Transaction } from '../db/client.js';
import {
  chatBranches, chatMessages, chatTurns, llmCall, llmUsage, memoryBanks, memoryRuns, memorySettings, projectAgents, projects,
} from '../db/schema.js';
import { selectRate, type PriceRate } from '../llm/usage/pricingResolver.js';
import { toPriceRate, UsageRepository } from '../llm/usage/usageRepository.js';
import { AgentRepository } from '../modules/agents/repository/agentsRepository.js';
import { buildDemoProjectRows, DEMO_MODEL, type DemoProjectRows } from './demoRows.js';
import { demoProjects } from './demoScenario.js';

export const DEMO_PROJECT_IDS = demoProjects.map((project) => project.id);
const DAY_MS = 24 * 60 * 60_000;

export type DemoSeedReport = { id: string; name: string; turns: number }[];

/**
 * Replaces the demo projects, and only them, in one transaction: projects are identified by their
 * fixed ids, never by name. Their teams come from the agent library, which is seeded first as the
 * server does at startup.
 */
export async function seedDemoProjects(database: Database, now = new Date()): Promise<DemoSeedReport> {
  return database.transaction(async (tx) => {
    await removeDemoProjects(tx);
    await new AgentRepository(tx).ensureLibrary();
    const report: DemoSeedReport = [];
    for (const [index, project] of demoProjects.entries()) {
      // Each project starts a few days ago so that its turns read as past activity.
      const startedAt = new Date(now.getTime() - (demoProjects.length - index + 1) * DAY_MS);
      await insertRows(tx, buildDemoProjectRows(project, { startedAt, rate: await demoRate(tx, startedAt) }));
      report.push({ id: project.id, name: project.name, turns: project.turns.length });
    }
    return report;
  });
}

/** The published price of the demo model, as the usage service would select it for a call at that date. */
async function demoRate(tx: Transaction, at: Date): Promise<PriceRate | null> {
  const rates = await new UsageRepository(tx).ratesFor(DEMO_MODEL.provider, DEMO_MODEL.model);
  return selectRate(
    rates.filter((rate) => rate.priceWindow === DEMO_MODEL.priceWindow || rate.priceWindow === 'all'), at, toPriceRate,
  );
}

/** Deletes the demo projects with everything they own; library agents stay. */
export async function clearDemoProjects(database: Database): Promise<void> {
  await database.transaction(removeDemoProjects);
}

async function removeDemoProjects(tx: Transaction): Promise<void> {
  // Cascades to branches, messages, turns, agent assignments, memory, LLM calls and usage.
  await tx.delete(projects).where(inArray(projects.id, DEMO_PROJECT_IDS));
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
