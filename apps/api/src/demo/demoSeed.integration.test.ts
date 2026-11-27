import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { count, eq, inArray } from 'drizzle-orm';
import {
  agentDtoSchema, chatBranchDtoSchema, chatHistorySchema, memoryTraceSchema, memoryViewSchema, projectAgentSchema,
  projectSchema, traceCallDetailSchema, turnMetricsListSchema, turnTraceSummarySchema,
  type ChatTurn, type TurnMetrics, type TurnTraceSummary,
} from '@choral-writer/shared';

import { buildApp } from '../app.js';
import * as schema from '../db/schema.js';
import { createTestPool } from '../tests/testDb.js';
import { createTestCallLLM } from '../tests/support/callLLM.js';
import { createTurnFixture, removeProjectFixture } from '../tests/fixtures/index.js';
import { createChatBranchService, createChatService } from '../modules/chat/index.js';
import { AgentsService } from '../modules/agents/services/agentsService.js';
import { ProjectsService } from '../modules/projects/services/projectServices.js';
import { MemoriesService } from '../modules/memories/services/memoriesService.js';
import { createTraceService } from '../modules/traces/index.js';
import { clearDemoProjects, DEMO_PROJECT_IDS, seedDemoProjects } from './demoSeed.js';

// Only run against an explicitly supplied disposable PostgreSQL database.
describe.skipIf(!process.env.DATABASE_URL)('demo data with PostgreSQL', () => {
  const pool = createTestPool();
  const database = drizzle(pool, { schema });
  const { callLLM } = createTestCallLLM({
    create: async () => { throw new Error('Demo data never calls an LLM.'); },
  });
  const projects = new ProjectsService(database, createChatBranchService);
  const memories = new MemoriesService(database, projects, callLLM);
  const app = buildApp({
    appPassword: 'test-password',
    cookieSecret: 'test-cookie-secret-with-at-least-thirty-two-characters',
    nodeEnv: 'test',
  }, {
    projects, agents: new AgentsService(database, projects), memories,
    chat: createChatService(database, projects, callLLM, memories), traces: createTraceService(database),
  });
  let cookie: string;
  let unrelatedProjectId: string | undefined;

  async function get(url: string) {
    const response = await app.inject({ method: 'GET', url, headers: { cookie } });
    expect(response.statusCode, url).toBe(200);
    const body: unknown = response.json();
    return body;
  }

  async function demoRowCounts() {
    const rows = async (table: typeof schema.chatTurns | typeof schema.llmCall | typeof schema.llmUsage | typeof schema.chatMessages) => {
      const [row] = await database.select({ value: count() }).from(table).where(inArray(table.projectId, DEMO_PROJECT_IDS));
      return row?.value;
    };
    return {
      turns: await rows(schema.chatTurns), messages: await rows(schema.chatMessages),
      calls: await rows(schema.llmCall), usage: await rows(schema.llmUsage),
    };
  }

  beforeAll(async () => {
    await migrate(database, { migrationsFolder: './src/db/migrations', migrationsSchema: 'choral_writer' });
    const login = await app.inject({ method: 'POST', url: '/api/login', payload: { password: 'test-password' } });
    cookie = login.cookies.map((item) => `${item.name}=${item.value}`).join('; ');
  }, 15_000);

  afterAll(async () => {
    await clearDemoProjects(database);
    if (unrelatedProjectId) await removeProjectFixture(database, unrelatedProjectId);
    await app.close();
    await pool.end();
  });

  it('replaces only its own projects when seeded again', async () => {
    const created = await app.inject({
      method: 'POST', url: '/api/projects', headers: { cookie },
      payload: { name: 'Projet sans rapport', systemPrompt: '' },
    });
    const unrelated = projectSchema.parse(created.json());
    unrelatedProjectId = unrelated.id;
    if (!unrelated.defaultBranchId) throw new Error('Missing default branch.');
    const { turnId } = await createTurnFixture(database, { projectId: unrelated.id, branchId: unrelated.defaultBranchId });

    await seedDemoProjects(database);
    const first = await demoRowCounts();
    await seedDemoProjects(database);

    expect(await demoRowCounts()).toEqual(first);
    expect(first.turns).toBeGreaterThan(0);
    const [kept] = await database.select().from(schema.chatTurns).where(eq(schema.chatTurns.id, turnId));
    expect(kept?.projectId).toBe(unrelated.id);
  });

  it('serves every demo turn, trace and memory through the API', async () => {
    await seedDemoProjects(database);
    const turns: ChatTurn[] = [];
    const summaries: TurnTraceSummary[] = [];
    const metrics: TurnMetrics[] = [];
    let alternatives = 0;
    for (const projectId of DEMO_PROJECT_IDS) {
      const project = projectSchema.parse(await get(`/api/projects/${projectId}`));
      const team = projectAgentSchema.array().parse(await get(`/api/projects/${projectId}/agents`));
      expect(team.filter((agent) => agent.phase === 'analysis').length).toBeGreaterThan(0);
      const branches = chatBranchDtoSchema.array().parse(await get(`/api/projects/${projectId}/branches`));
      expect(branches.some((branch) => branch.id === project.defaultBranchId)).toBe(true);
      alternatives += branches.filter((branch) => branch.sourceBranchId !== null).length;
      for (const branch of branches) {
        const branchPath = `/api/projects/${projectId}/branches/${branch.id}`;
        const history = chatHistorySchema.parse(await get(`${branchPath}/history`));
        metrics.push(...turnMetricsListSchema.parse(await get(`${branchPath}/turn-metrics`)));
        const memory = memoryViewSchema.parse(await get(`${branchPath}/memories`));
        expect(memory.enabled).toBe(true);
        expect(memory.state.tags.some((tag) => tag.name === 'Intentions')).toBe(true);
        for (const turn of history.turns) {
          turns.push(turn);
          const summary = turnTraceSummarySchema.parse(await get(`/api/projects/${projectId}/turns/${turn.id}/traces`));
          summaries.push(summary);
          for (const call of summary.calls) {
            traceCallDetailSchema.parse(await get(`/api/projects/${projectId}/turns/${turn.id}/traces/${call.id}`));
          }
          memoryTraceSchema.parse(await get(`/api/projects/${projectId}/turns/${turn.id}/memory`));
        }
      }
    }

    expect(alternatives).toBe(1);
    expect(turns.some((turn) => turn.status === 'failed')).toBe(true);
    expect(turns.some((turn) => turn.regeneratedFromTurnId !== null)).toBe(true);
    expect(summaries.some((summary) => summary.configuration === null)).toBe(true);
    expect(summaries.some((summary) => summary.direction?.status === 'success')).toBe(true);
    expect(summaries.some((summary) => summary.narrator?.status === 'error')).toBe(true);
    expect(summaries.some((summary) => summary.analysis.some((analysis) => analysis.attempts > 1))).toBe(true);
    expect(summaries.some((summary) => summary.cost.complete && summary.cost.microUsd > 0)).toBe(true);
    const changes = metrics.flatMap((metric) => metric.configurationChanges ?? []).map((change) => change.kind);
    expect(changes).toEqual(expect.arrayContaining(['agentChanged', 'agentRemoved']));
    expect(metrics.some((metric) => metric.direction?.status === 'success' && metric.direction.nudges.length > 0)).toBe(true);
    expect(metrics.some((metric) => metric.direction === null)).toBe(true);
    expect(metrics.some((metric) => metric.direction?.status === 'error')).toBe(true);
    expect(summaries.some((summary) => summary.direction?.status === 'error' && summary.direction.attempts === 2)).toBe(true);
    // The « Développements » tab: developments split by scope, absent from turns recorded before them.
    expect(summaries.some((summary) => summary.developments === null)).toBe(true);
    expect(summaries.some((summary) => (summary.developments?.scene.length ?? 0) > 0)).toBe(true);
    expect(summaries.some((summary) => (summary.developments?.offscreen.length ?? 0) > 0)).toBe(true);
  });

  it('clears the demo projects and keeps the library', async () => {
    await clearDemoProjects(database);

    const ids = projectSchema.array().parse(await get('/api/projects')).map((project) => project.id);
    expect(ids).not.toEqual(expect.arrayContaining([DEMO_PROJECT_IDS[0]]));
    expect(ids).toContain(unrelatedProjectId);
    const agents = agentDtoSchema.array().parse(await get('/api/agents'));
    expect(agents.some((agent) => agent.id === '019aee00-0000-7000-8000-000000000106')).toBe(true);
  });
});
