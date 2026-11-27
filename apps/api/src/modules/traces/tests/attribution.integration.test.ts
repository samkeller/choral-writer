import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { and, eq } from 'drizzle-orm';
import type {
  ChatCompletion, ChatCompletionChunk, ChatCompletionCreateParamsNonStreaming, ChatCompletionCreateParamsStreaming,
} from 'openai/resources/chat/completions';
import {
  chatEventSchema, memoryViewSchema, projectSchema, turnAttributionResponseSchema, turnMetricsListSchema,
  turnTraceSummarySchema,
} from '@choral-writer/shared';

import { buildApp } from '../../../app.js';
import * as schema from '../../../db/schema.js';
import { createTestPool } from '../../../tests/testDb.js';
import { createCallLLM } from '../../../llm/call-llm.js';
import { testProvider } from '../../../tests/support/callLLM.js';
import { createUsageService } from '../../../llm/usage/usageService.js';
import { createChatBranchService, createChatService } from '../../chat/index.js';
import { AgentsService } from '../../agents/services/agentsService.js';
import { ProjectsService } from '../../projects/services/projectServices.js';
import { MemoriesService } from '../../memories/services/memoriesService.js';
import { createAttributionService, createTraceService } from '../index.js';

// The model is simulated: no real LLM call. Only runs against a disposable PostgreSQL database.
describe.skipIf(!process.env.DATABASE_URL)('turn attribution with PostgreSQL', () => {
  const pool = createTestPool();
  const database = drizzle(pool, { schema });
  const analysisContent = JSON.stringify({
    v: 1, agent: 'Chaos', summary: 'Un piège possible.', items: [
      { kind: 'observation', text: 'Un fil est visible.', importance: 'HIGH' },
    ],
  });
  let attributionContent = '';
  const completion = (content: string): ChatCompletion => ({
    id: 'test', object: 'chat.completion', created: 0, model: 'simulated-model',
    choices: [{ index: 0, finish_reason: 'stop', logprobs: null, message: { role: 'assistant', content, refusal: null, annotations: [] } }],
    usage: { prompt_tokens: 18, completion_tokens: 8, total_tokens: 26 },
  });
  const chunk = (content: string, finish_reason: 'stop' | null = null): ChatCompletionChunk => ({
    id: 'stream', object: 'chat.completion.chunk', created: 0, model: 'simulated-model',
    choices: [{ index: 0, delta: { content }, finish_reason }],
    ...(finish_reason ? { usage: { prompt_tokens: 20, completion_tokens: 4, total_tokens: 24 } } : {}),
  });
  const create = vi.fn(async (
    params: ChatCompletionCreateParamsNonStreaming | ChatCompletionCreateParamsStreaming,
  ): Promise<ChatCompletion | AsyncIterable<ChatCompletionChunk>> => {
    if (params.stream) {
      return (async function* () { yield chunk('Une prose fictive.'); yield chunk('', 'stop'); })();
    }
    const system = String(params.messages[0]?.content);
    return completion(system.includes('Tu compares la prose') ? attributionContent : analysisContent);
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
  const chat = createChatService(database, projects, callLLM, memories);
  const traces = createTraceService(database);
  const app = buildApp({
    appPassword: 'test-password',
    cookieSecret: 'test-cookie-secret-with-at-least-thirty-two-characters',
    nodeEnv: 'test',
  }, { projects, agents, chat, traces, memories, attribution: createAttributionService(database, callLLM, traces) });
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

  /** A project with one analysis agent, memory off, and one completed turn. */
  async function completedTurn(): Promise<{ projectId: string; branchId: string; turnId: string }> {
    const project = projectSchema.parse((await app.inject({
      method: 'POST', url: '/api/projects', headers: { cookie },
      payload: { name: 'Attribution', systemPrompt: 'Tu es le narrateur de ce monde.' },
    })).json());
    createdIds.push(project.id);
    const branchId = project.defaultBranchId!;
    const memoriesUrl = `/api/projects/${project.id}/branches/${branchId}/memories`;
    const view = memoryViewSchema.parse((await app.inject({ method: 'GET', url: memoriesUrl, headers: { cookie } })).json());
    await app.inject({
      method: 'POST', url: memoriesUrl, headers: { cookie },
      payload: { expectedHeadTurnId: view.headTurnId, expectedRevisionId: view.revisionId,
        expectedCatalogRevisionId: view.catalogRevisionId, change: { op: 'settings', enabled: false } },
    });
    const defaults = await agents.listForProject(project.id);
    const analyst = await agents.create({ name: 'Chaos', instructions: 'Cherche l’incertitude.', phase: 'analysis', output: 'envelope' });
    await agents.configure(project.id, { agents: [
      ...defaults.map(({ agentId, versionId }) => ({ agentId, versionId })),
      { agentId: analyst.id, versionId: analyst.versions[0]!.id },
    ] });
    const response = await app.inject({
      method: 'POST', url: `/api/projects/${project.id}/branches/${branchId}/turns`,
      headers: { cookie }, payload: { content: 'J’ouvre la porte.', expectedHeadTurnId: null },
    });
    const started = response.body.split('\n').filter((line) => line.startsWith('data: '))
      .map((line) => chatEventSchema.parse(JSON.parse(line.slice(6))))
      .find((event) => event.type === 'chat.turn.started');
    if (started?.type !== 'chat.turn.started') throw new Error('Missing started turn.');
    return { projectId: project.id, branchId, turnId: started.turnId };
  }

  const attribute = (projectId: string, turnId: string, payload: object = {}) => app.inject({
    method: 'POST', url: `/api/projects/${projectId}/turns/${turnId}/attribution`, headers: { cookie }, payload,
  });

  it('computes the attribution once, caches it on the turn and keeps its cost out of the turn', async () => {
    const { projectId, branchId, turnId } = await completedTurn();
    const before = turnTraceSummarySchema.parse((await app.inject({
      method: 'GET', url: `/api/projects/${projectId}/turns/${turnId}/traces`, headers: { cookie },
    })).json());
    attributionContent = JSON.stringify({
      whatHappened: 'Le protagoniste ouvre la porte.', contributions: [{ id: 1, verdict: 'retenu', note: 'dès la première phrase' }],
    });

    expect((await app.inject({ method: 'POST', url: `/api/projects/${projectId}/turns/${turnId}/attribution` })).statusCode).toBe(401);
    const first = await attribute(projectId, turnId);
    expect(first.statusCode, first.body).toBe(200);
    const computed = turnAttributionResponseSchema.parse(first.json());
    expect(computed.attribution.contributions).toMatchObject([
      { agent: 'Chaos', item: { text: 'Un fil est visible.' }, verdict: 'retenu' },
    ]);
    expect(computed.cost.calls).toBe(1);

    const calls = create.mock.calls.length;
    const cached = turnAttributionResponseSchema.parse((await attribute(projectId, turnId)).json());
    expect(cached.attribution).toEqual(computed.attribution);
    expect(create.mock.calls.length).toBe(calls);
    const [turn] = await database.select({ attribution: schema.chatTurns.attribution }).from(schema.chatTurns)
      .where(eq(schema.chatTurns.id, turnId));
    expect(turn?.attribution).toEqual(computed.attribution);

    const usage = await database.select().from(schema.llmUsage)
      .where(and(eq(schema.llmUsage.turnId, turnId), eq(schema.llmUsage.stage, 'attribution')));
    expect(usage).toHaveLength(1);
    const after = turnTraceSummarySchema.parse((await app.inject({
      method: 'GET', url: `/api/projects/${projectId}/turns/${turnId}/traces`, headers: { cookie },
    })).json());
    expect(after.calls.map((call) => call.id)).toEqual(before.calls.map((call) => call.id));
    expect(after.cost).toEqual(before.cost);
    expect(after.timeline).toEqual(before.timeline);
    const metrics = turnMetricsListSchema.parse((await app.inject({
      method: 'GET', url: `/api/projects/${projectId}/branches/${branchId}/turn-metrics`, headers: { cookie },
    })).json());
    expect(metrics[0]?.durationMs).toBe(before.durationMs);
    // The raw call stays reachable from its turn.
    expect((await app.inject({
      method: 'GET', url: `/api/projects/${projectId}/turns/${turnId}/traces/${computed.attribution.callId}`, headers: { cookie },
    })).statusCode).toBe(200);
  });

  it('reports a failed attribution, keeps the previous one and recomputes only on request', async () => {
    const { projectId, turnId } = await completedTurn();
    attributionContent = JSON.stringify({ whatHappened: 'Première lecture.', contributions: [{ id: 1, verdict: 'partiel', note: '' }] });
    const first = turnAttributionResponseSchema.parse((await attribute(projectId, turnId)).json());

    attributionContent = 'pas du JSON';
    const failed = await attribute(projectId, turnId, { regenerate: true });
    expect(failed.statusCode).toBe(502);
    expect(failed.json()).toMatchObject({ error: { code: 'LLM_INVALID_RESPONSE' } });
    expect(turnAttributionResponseSchema.parse((await attribute(projectId, turnId)).json()).attribution).toEqual(first.attribution);

    attributionContent = JSON.stringify({ whatHappened: 'Seconde lecture.', contributions: [{ id: 1, verdict: 'absent', note: '' }] });
    const regenerated = turnAttributionResponseSchema.parse((await attribute(projectId, turnId, { regenerate: true })).json());
    expect(regenerated.attribution.whatHappened).toBe('Seconde lecture.');
    expect(regenerated.cost.calls).toBe(3);
  });

  it('does not reveal a turn of another project', async () => {
    const { turnId } = await completedTurn();
    const { projectId: other } = await completedTurn();

    expect((await attribute(other, turnId)).statusCode).toBe(404);
  });
});
