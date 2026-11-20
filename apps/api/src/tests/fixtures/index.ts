import { sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

import * as schema from '../../db/schema.js';
import type { Database } from '../../db/client.js';
import { agentVersions, agents, projectAgents } from '../../db/entities/agents/agent.js';
import { projects } from '../../db/entities/project.js';
import { chatBranches } from '../../db/entities/chat/branch.js';
import { chatMessages } from '../../db/entities/chat/message.js';
import { chatTurns } from '../../db/entities/chat/turn.js';
import { llmCall } from '../../db/entities/llmCall.js';
import { llmUsage } from '../../db/entities/llmUsage.js';
import { DEFAULT_GUARDIAN_ID, DEFAULT_NARRATOR_ID } from '../../modules/agents/repository/defaultNarrators.js';

/**
 * Fabriques de données de test et de démonstration.
 *
 * Objectif : rendre les tests d'agrégation lisibles et indépendants de l'ordre
 * d'exécution, sans que chaque fichier redécouvre le schéma. Les identifiants restent
 * injectables pour que les assertions soient déterministes.
 *
 * Ce module écrit directement en base sans passer par les services : c'est précisément
 * ce qui permet de fabriquer un état arbitraire, impossible à produire par le pipeline.
 */
export interface FixtureProject {
  projectId: string;
  branchId: string;
}

export async function createProjectFixture(
  database: Database,
  input: { name?: string; systemPrompt?: string; id?: string } = {},
): Promise<FixtureProject> {
  const projectId = input.id ?? uuidv7();
  const branchId = uuidv7();
  await database.insert(projects).values({
    id: projectId,
    name: input.name ?? `Projet ${projectId.slice(-6)}`,
    systemPrompt: input.systemPrompt ?? 'Tu es le narrateur de ce monde.',
  });
  await database.insert(chatBranches).values({ id: branchId, projectId, name: 'Principale' });
  await database.update(projects).set({ defaultBranchId: branchId })
    .where(sql`${projects.id} = ${projectId}`);
  await database.insert(projectAgents).values([
    ...await defaultBinding(database, projectId, DEFAULT_NARRATOR_ID, 'narrative'),
    ...await defaultBinding(database, projectId, DEFAULT_GUARDIAN_ID, 'memory_proposals'),
  ]);
  return { projectId, branchId };
}

async function defaultBinding(
  database: Database, projectId: string, agentId: string, output: 'narrative' | 'memory_proposals',
) {
  const [version] = await database.select({ id: agentVersions.id }).from(agentVersions)
    .where(sql`${agentVersions.agentId} = ${agentId}`)
    .orderBy(sql`${agentVersions.version} desc`).limit(1);
  if (!version) throw new Error('Missing built-in agent version; apply database migrations first.');
  return [{
    projectId, agentId, versionId: version.id,
    phase: 'restitution' as const, output,
    memoryRead: { mode: 'all' as const, tagIds: [] },
  }];
}

/** Épingle un nouvel agent d'analyse au projet : sert à simuler un changement d'équipe. */
export async function createAnalysisAgentFixture(
  database: Database, projectId: string, name: string,
): Promise<{ agentId: string; versionId: string }> {
  const agentId = uuidv7();
  const versionId = uuidv7();
  await database.insert(agents).values({ id: agentId, phase: 'analysis', output: 'envelope' });
  await database.insert(agentVersions).values({
    id: versionId, agentId, version: 1, name, instructions: `Instructions for ${name}.`,
  });
  await database.insert(projectAgents).values({
    projectId, agentId, versionId, phase: 'analysis', output: 'envelope',
    memoryRead: { mode: 'none', tagIds: [] },
  });
  return { agentId, versionId };
}

/** Crée un tour et son message utilisateur, en avance la tête de branche, sans pipeline. */
export async function createTurnFixture(
  database: Database,
  input: {
    projectId: string; branchId: string;
    parentTurnId?: string | null; turnId?: string;
    status?: 'running' | 'completed' | 'failed'; assistantContent?: string | null;
  },
): Promise<{ turnId: string; userMessageId: string }> {
  const turnId = input.turnId ?? uuidv7();
  const userMessageId = uuidv7();
  const status = input.status ?? 'completed';
  await database.insert(chatMessages).values({
    id: userMessageId, projectId: input.projectId, role: 'user',
    content: `Message ${turnId.slice(-6)}`,
  });
  let assistantMessageId: string | null = null;
  if (status === 'completed') {
    assistantMessageId = uuidv7();
    await database.insert(chatMessages).values({
      id: assistantMessageId, projectId: input.projectId, role: 'assistant',
      content: input.assistantContent ?? `Réponse ${turnId.slice(-6)}`,
    });
  }
  await database.insert(chatTurns).values({
    id: turnId, projectId: input.projectId, originBranchId: input.branchId,
    parentTurnId: input.parentTurnId ?? null, userMessageId, assistantMessageId, status,
    completedAt: status === 'running' ? null : new Date(),
  });
  await database.update(chatBranches).set({ headTurnId: turnId })
    .where(sql`${chatBranches.id} = ${input.branchId}`);
  return { turnId, userMessageId };
}

/** Insère un appel LLM et sa ligne de registre, avec un coût imposé. */
export async function createUsageFixture(
  database: Database,
  input: {
    projectId: string;
    turnId?: string | null;
    stage?: 'analysis' | 'narrator' | 'guardian' | 'memory_setup';
    agentVersionId?: string | null;
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
    costMicroUsd?: number | null;
    costBasis?: 'provider_confirmed' | 'priced' | 'unpriced';
    durationMs?: number;
    createdAt?: Date;
  },
): Promise<{ callId: string }> {
  const callId = uuidv7();
  const inputTokens = input.inputTokens ?? 1_000;
  const outputTokens = input.outputTokens ?? 200;
  const costMicroUsd = input.costMicroUsd === undefined ? 1_000 : input.costMicroUsd;
  const createdAt = input.createdAt ?? new Date();
  const stage = input.stage ?? 'analysis';
  await database.insert(llmCall).values({
    id: callId, projectId: input.projectId, turnId: input.turnId ?? null, stage,
    agentVersionId: input.agentVersionId ?? null,
    model: input.model ?? 'deepseek-flash', request: { messages: [] }, response: 'fixture',
    inputTokens, outputTokens, durationMs: input.durationMs ?? 100, status: 'success', createdAt,
  });
  await database.insert(llmUsage).values({
    id: uuidv7(), callId, projectId: input.projectId, turnId: input.turnId ?? null,
    stage, agentVersionId: input.agentVersionId ?? null, provider: 'deepseek',
    model: input.model ?? 'deepseek-flash',
    inputTokens, outputTokens, cachedInputTokens: input.cachedInputTokens ?? null,
    durationMs: input.durationMs ?? 100, status: 'success',
    costBasis: input.costBasis ?? (costMicroUsd === null ? 'unpriced' : 'priced'),
    costMicroUsd, createdAt,
  });
  return { callId };
}

/** Supprime un projet et, par cascade, tout ce qui en dépend. */
export async function removeProjectFixture(database: Database, projectId: string): Promise<void> {
  await database.delete(projects).where(sql`${projects.id} = ${projectId}`);
}

export { drizzle };
