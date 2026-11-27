import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq } from 'drizzle-orm';
import type {
  ChatCompletion, ChatCompletionChunk, ChatCompletionCreateParamsNonStreaming, ChatCompletionCreateParamsStreaming,
} from 'openai/resources/chat/completions';
import { chatEventSchema, memoryViewSchema, projectSchema, type ChatEvent } from '@choral-writer/shared';

import { buildApp } from '../../../app.js';
import * as schema from '../../../db/schema.js';
import { createTestPool } from '../../../tests/testDb.js';
import { createCallLLM } from '../../../llm/call-llm.js';
import { testProvider } from '../../../tests/support/callLLM.js';
import { createUsageService } from '../../../llm/usage/usageService.js';
import { createChatBranchService, createChatService, VariantAdoptionService } from '../index.js';
import { AgentsService } from '../../agents/services/agentsService.js';
import { ProjectsService } from '../../projects/services/projectServices.js';
import { MemoriesService } from '../../memories/services/memoriesService.js';
import { createTraceService } from '../../traces/index.js';

// The model is simulated: no real LLM call. Only runs against a disposable PostgreSQL database.
describe.skipIf(!process.env.DATABASE_URL)('adopting a variant of a turn with PostgreSQL', () => {
  const pool = createTestPool();
  const database = drizzle(pool, { schema });
  const analysis = JSON.stringify({
    v: 1, agent: 'Chaos', summary: 'Un piège possible.', items: [
      { kind: 'observation', text: 'Un fil est visible.', importance: 'HIGH' },
    ],
  });
  const create = vi.fn(async (
    params: ChatCompletionCreateParamsNonStreaming | ChatCompletionCreateParamsStreaming,
  ): Promise<ChatCompletion | AsyncIterable<ChatCompletionChunk>> => {
    if (params.stream) {
      const chunk = (content: string, finish_reason: 'stop' | null = null): ChatCompletionChunk => ({
        id: 'stream', object: 'chat.completion.chunk', created: 0, model: 'simulated-model',
        choices: [{ index: 0, delta: { content }, finish_reason }],
        ...(finish_reason ? { usage: { prompt_tokens: 20, completion_tokens: 4, total_tokens: 24 } } : {}),
      });
      return (async function* () { yield chunk('Une prose fictive.'); yield chunk('', 'stop'); })();
    }
    return {
      id: 'test', object: 'chat.completion', created: 0, model: 'simulated-model',
      choices: [{ index: 0, finish_reason: 'stop', logprobs: null, message: { role: 'assistant', content: analysis, refusal: null, annotations: [] } }],
      usage: { prompt_tokens: 18, completion_tokens: 8, total_tokens: 26 },
    };
  });
  const callLLM = createCallLLM({
    client: { chat: { completions: { create } } },
    model: 'simulated-model',
    provider: testProvider,
    usage: createUsageService(database),
    traces: {
      insert: async ({ messages, memory, ...trace }) => {
        await database.insert(schema.llmCall).values({ ...trace, request: { messages, memory } });
      },
    },
  });
  const projects = new ProjectsService(database, createChatBranchService);
  const agents = new AgentsService(database, projects);
  const memories = new MemoriesService(database, projects, callLLM);
  const app = buildApp({
    appPassword: 'test-password',
    cookieSecret: 'test-cookie-secret-with-at-least-thirty-two-characters',
    nodeEnv: 'test',
  }, {
    projects, agents, memories, chat: createChatService(database, projects, callLLM, memories),
    traces: createTraceService(database), adoption: new VariantAdoptionService(projects),
  });
  let cookie: string;
  const createdIds: string[] = [];

  beforeAll(async () => {
    await migrate(database, { migrationsFolder: './src/db/migrations', migrationsSchema: 'choral_writer' });
    const login = await app.inject({ method: 'POST', url: '/api/login', payload: { password: 'test-password' } });
    cookie = login.cookies.map((item) => `${item.name}=${item.value}`).join('; ');
  }, 15_000);

  afterAll(async () => {
    await app.close();
    for (const id of createdIds) await database.delete(schema.projects).where(eq(schema.projects.id, id));
    await pool.end();
  });

  function events(body: string): ChatEvent[] {
    return body.split('\n').filter((line) => line.startsWith('data: '))
      .map((line) => chatEventSchema.parse(JSON.parse(line.slice(6))));
  }

  /**
   * A project with memory off and one completed turn, then a variant of it on a new branch, replayed with an
   * extra analysis agent and another project prompt.
   */
  async function originalAndVariant() {
    const project = projectSchema.parse((await app.inject({
      method: 'POST', url: '/api/projects', headers: { cookie },
      payload: { name: 'Adoption', systemPrompt: 'Prompt d’origine.' },
    })).json());
    createdIds.push(project.id);
    const mainBranchId = project.defaultBranchId!;
    const memoriesUrl = `/api/projects/${project.id}/branches/${mainBranchId}/memories`;
    const view = memoryViewSchema.parse((await app.inject({ method: 'GET', url: memoriesUrl, headers: { cookie } })).json());
    await app.inject({
      method: 'POST', url: memoriesUrl, headers: { cookie },
      payload: { expectedHeadTurnId: view.headTurnId, expectedRevisionId: view.revisionId,
        expectedCatalogRevisionId: view.catalogRevisionId, change: { op: 'settings', enabled: false } },
    });
    const sent = events((await app.inject({
      method: 'POST', url: `/api/projects/${project.id}/branches/${mainBranchId}/turns`,
      headers: { cookie }, payload: { content: 'J’ouvre la porte.', expectedHeadTurnId: null },
    })).body).find((event) => event.type === 'chat.turn.completed');
    if (sent?.type !== 'chat.turn.completed') throw new Error('Missing original turn.');

    const defaults = await agents.listForProject(project.id);
    const analyst = await agents.create({ name: 'Chaos', instructions: 'Cherche l’incertitude.', phase: 'analysis', output: 'envelope' });
    const variantAgents = [
      ...defaults.map(({ agentId, versionId }) => ({ agentId, versionId })),
      { agentId: analyst.id, versionId: analyst.versions[0]!.id },
    ];
    const replayed = events((await app.inject({
      method: 'POST', url: `/api/projects/${project.id}/branches/${mainBranchId}/turns/${sent.turnId}/regenerate`,
      headers: { cookie },
      payload: { expectedHeadTurnId: sent.turnId, configuration: { systemPrompt: 'Prompt de la variante.', agents: variantAgents } },
    })).body).find((event) => event.type === 'chat.turn.completed');
    if (replayed?.type !== 'chat.turn.completed') throw new Error('Missing variant turn.');
    return {
      projectId: project.id, mainBranchId, originalTurnId: sent.turnId,
      variantTurnId: replayed.turnId, variantBranchId: replayed.branchId, variantAgents, defaults,
    };
  }

  const adopt = (projectId: string, turnId: string) => app.inject({
    method: 'POST', url: `/api/projects/${projectId}/turns/${turnId}/adoption`, headers: { cookie },
  });
  const projectAgents = async (projectId: string) =>
    (await agents.listForProject(projectId)).map(({ agentId, versionId }) => ({ agentId, versionId }));
  const sorted = <T extends { agentId: string }>(items: T[]) => [...items].sort((a, b) => a.agentId.localeCompare(b.agentId));

  it('makes the variant’s configuration the project’s and moves the story to its branch', async () => {
    const { projectId, mainBranchId, variantTurnId, variantBranchId, variantAgents } = await originalAndVariant();
    expect(variantBranchId).not.toBe(mainBranchId);
    expect((await app.inject({ method: 'POST', url: `/api/projects/${projectId}/turns/${variantTurnId}/adoption` })).statusCode)
      .toBe(401);

    const response = await adopt(projectId, variantTurnId);
    expect(response.statusCode, response.body).toBe(200);
    expect(projectSchema.parse(response.json())).toMatchObject({
      systemPrompt: 'Prompt de la variante.', defaultBranchId: variantBranchId,
    });
    const [stored] = await database.select().from(schema.projects).where(eq(schema.projects.id, projectId));
    expect(stored).toMatchObject({ systemPrompt: 'Prompt de la variante.', defaultBranchId: variantBranchId });
    expect(sorted(await projectAgents(projectId))).toEqual(sorted(variantAgents));
  });

  it('changes nothing when the turn is not a variant, as keeping the original does', async () => {
    const { projectId, mainBranchId, originalTurnId, defaults } = await originalAndVariant();

    const response = await adopt(projectId, originalTurnId);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: 'TURN_NOT_VARIANT' } });
    const [stored] = await database.select().from(schema.projects).where(eq(schema.projects.id, projectId));
    expect(stored).toMatchObject({ systemPrompt: 'Prompt d’origine.', defaultBranchId: mainBranchId });
    expect(sorted(await projectAgents(projectId)))
      .toEqual(sorted(defaults.map(({ agentId, versionId }) => ({ agentId, versionId }))));
  });

  it('refuses a recorded configuration that is no longer valid, without changing anything', async () => {
    const { projectId, mainBranchId, variantTurnId, defaults } = await originalAndVariant();
    // A recorded configuration without a narrator cannot become the project's.
    const [turn] = await database.select({ configuration: schema.chatTurns.configuration }).from(schema.chatTurns)
      .where(eq(schema.chatTurns.id, variantTurnId));
    await database.update(schema.chatTurns).set({ configuration: {
      ...turn!.configuration!, agents: turn!.configuration!.agents.filter((agent) => agent.output !== 'narrative'),
    } }).where(eq(schema.chatTurns.id, variantTurnId));

    expect((await adopt(projectId, variantTurnId)).statusCode).toBe(400);
    const [stored] = await database.select().from(schema.projects).where(eq(schema.projects.id, projectId));
    expect(stored).toMatchObject({ systemPrompt: 'Prompt d’origine.', defaultBranchId: mainBranchId });
    expect(sorted(await projectAgents(projectId)))
      .toEqual(sorted(defaults.map(({ agentId, versionId }) => ({ agentId, versionId }))));
  });

  it('does not adopt a turn of another project', async () => {
    const { variantTurnId } = await originalAndVariant();
    const { projectId: other } = await originalAndVariant();

    expect((await adopt(other, variantTurnId)).statusCode).toBe(404);
  });
});
