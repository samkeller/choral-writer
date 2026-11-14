import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { z } from 'zod';
import { and, eq, notInArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { LlmClient, proposalsSchema } from '@choral/engine';
import { parse as parseYaml } from 'yaml';
import { agents, branches, budgetReservations, globalSettings, llmCalls, projects, proposals, turns, whiteboardEntries } from './schema.js';
import { applyProposals, assertNoActiveTurn, branchEvents, debugProposals, DomainError, ensureBranch, getMemory, lockedProject, rewind, switchBranch } from './memory.js';
import { agentSchema, defaultAgents, proposalInstructions } from './agents.js';
import { createTurn, runGuardian, runTurn } from './turns.js';
import type { Pool } from 'pg';
import { withProjectExecutionLock } from './locks.js';
import { BudgetError, budgetHooks, projectSettingsSchema } from './budget.js';

type Settings = {
  password: string;
  cookieSecret: string;
  llmApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
  secureCookies: boolean;
  staticRoot?: string;
};

const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  worldMd: z.string().max(100_000).default(''),
  instructions: z.string().max(30_000).optional(),
  agentsYaml: z.string().max(100_000).optional(),
  settings: projectSettingsSchema.optional()
}).strict();
const loginSchema = z.object({ password: z.string().max(1024) }).strict();
const callSchema = z.object({ prompt: z.string().trim().min(1).max(20_000) }).strict();
const projectIdSchema = z.object({ id: z.string().uuid() });

export async function buildApp(db: NodePgDatabase & { $client: Pool }, settings: Settings, fetcher: typeof fetch = fetch) {
  const globalInstructions = await readFile(new URL('../../../config/global.md', import.meta.url), 'utf8');
  await db.insert(globalSettings).values({ key: 'instructions', value: globalInstructions }).onConflictDoNothing();
  const app = Fastify({ logger: true, bodyLimit: 150_000 });
  await app.register(cookie, { secret: settings.cookieSecret });
  await app.register(rateLimit, { global: false });
  if (settings.staticRoot) {
    await app.register(fastifyStatic, { root: settings.staticRoot, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api/')) return reply.sendFile('index.html');
      return reply.code(404).send({ error: 'Not found' });
    });
  }

  const hooks = budgetHooks(db);
  const client = new LlmClient(settings.llmBaseUrl, settings.llmApiKey, hooks.trace, fetcher, hooks.reserve);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof DomainError) return reply.code(error.statusCode).send({ error: error.message });
    if (error instanceof BudgetError) return reply.code(409).send({ error: error.message });
    request.log.error(error);
    return reply.code(500).send({ error: 'Internal server error' });
  });

  app.post('/api/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = loginSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid request' });
    const supplied = createHash('sha256').update(body.data.password).digest();
    const expected = createHash('sha256').update(settings.password).digest();
    if (!timingSafeEqual(supplied, expected)) return reply.code(401).send({ error: 'Invalid password' });
    return reply.setCookie('session', String(Date.now() + 24 * 60 * 60 * 1000), {
      signed: true, httpOnly: true, sameSite: 'strict', secure: settings.secureCookies,
      path: '/', maxAge: 60 * 60 * 24
    }).send({ ok: true });
  });

  app.addHook('preHandler', async (request, reply) => {
    if (!request.url.startsWith('/api/') || request.url === '/api/login') return;
    const value = request.cookies.session;
    const session = value ? request.unsignCookie(value) : undefined;
    if (!session?.valid || !session.value || !/^\d+$/.test(session.value) || Number(session.value) <= Date.now()) {
      return reply.code(401).send({ error: 'Authentication required' });
    }
  });

  app.post('/api/logout', async (_request, reply) => {
    return reply.clearCookie('session', { path: '/' }).send({ ok: true });
  });
  app.get('/api/settings/instructions', async () => {
    const [row] = await db.select().from(globalSettings).where(eq(globalSettings.key, 'instructions'));
    return { instructions: row.value };
  });
  app.put('/api/settings/instructions', async (request, reply) => {
    const body = z.object({ instructions: z.string().trim().min(1).max(30000) }).strict().safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid instructions' });
    await db.update(globalSettings).set({ value: body.data.instructions }).where(eq(globalSettings.key, 'instructions'));
    return body.data;
  });
  app.post('/api/projects', async (request, reply) => {
    const body = createProjectSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid request' });
    let configs = defaultAgents(settings.llmModel);
    if (body.data.agentsYaml) {
      try {
        configs = z.array(agentSchema).min(1).parse(parseYaml(body.data.agentsYaml));
      } catch (error) {
        return reply.code(400).send({ error: `Invalid agents YAML: ${error instanceof Error ? error.message : 'invalid format'}` });
      }
    }
    if (new Set(configs.map(agent => agent.key)).size !== configs.length ||
      configs.filter(agent => agent.kind === 'interpreter' && agent.enabled).length !== 1 ||
      configs.filter(agent => agent.kind === 'output' && agent.params.purpose === 'narrator' && agent.enabled).length !== 1 ||
      configs.filter(agent => agent.kind === 'output' && agent.params.purpose === 'guardian' && agent.enabled).length !== 1) {
      return reply.code(400).send({ error: 'Agents require unique keys and exactly one enabled interpreter, narrator and guardian' });
    }
    const instructions = body.data.instructions ?? extractInstructions(body.data.worldMd);
    const project = await db.transaction(async tx => {
      const [created] = await tx.insert(projects).values({
        name: body.data.name, worldMd: body.data.worldMd, instructions, worldInitialized: !body.data.worldMd.trim(),
        settings: body.data.settings ?? {}
      }).returning();
      await tx.insert(agents).values(configs.map(agent => ({
        projectId: created.id, key: agent.key, name: agent.name, kind: agent.kind,
        systemPrompt: agent.system_prompt, model: agent.model, params: agent.params,
        contextSpec: agent.context, schedule: agent.schedule, required: agent.required, enabled: agent.enabled
      })));
      const branch = await ensureBranch(tx, created.id, null);
      return { ...created, activeBranchId: branch.branchId };
    });
    return reply.code(201).send(project);
  });
  app.get('/api/projects', async () => db.select().from(projects).orderBy(projects.createdAt));
  app.get('/api/projects/:id', async (request, reply) => {
    const params = projectIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid project ID' });
    const [project] = await db.select().from(projects).where(eq(projects.id, params.data.id));
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    return project;
  });
  app.put('/api/projects/:id/settings', async (request, reply) => {
    const params = projectIdSchema.safeParse(request.params);
    const settings = projectSettingsSchema.safeParse(request.body);
    if (!params.success || !settings.success) return reply.code(400).send({ error: 'Invalid project settings' });
    return withProjectExecutionLock(db.$client, params.data.id, () => db.transaction(async tx => {
      await lockedProject(tx, params.data.id);
      const [active] = await tx.select({ status: turns.status }).from(turns).where(and(
        eq(turns.projectId, params.data.id), notInArray(turns.status, ['committed', 'failed', 'narrated'])
      )).limit(1);
      if (active) throw new DomainError('A turn is in progress', 409);
      const [updated] = await tx.update(projects).set({ settings: settings.data }).where(eq(projects.id, params.data.id)).returning();
      return updated;
    }));
  });
  app.get('/api/projects/:id/budget-reservations', async (request, reply) => {
    const params = projectIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid project ID' });
    const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, params.data.id));
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    return db.select().from(budgetReservations).where(eq(budgetReservations.projectId, project.id));
  });
  app.post('/api/projects/:id/budget-reservations/:reservationId/settle', async (request, reply) => {
    const params = z.object({ id: z.string().uuid(), reservationId: z.string().uuid() }).safeParse(request.params);
    const body = z.object({ costUsd: z.number().finite().nonnegative() }).strict().safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'Invalid settlement' });
    return withProjectExecutionLock(db.$client, params.data.id, () => db.transaction(async tx => {
      await lockedProject(tx, params.data.id);
      const [updated] = await tx.update(budgetReservations).set({ settledAmount: String(body.data.costUsd), settled: true })
        .where(and(eq(budgetReservations.id, params.data.reservationId), eq(budgetReservations.projectId, params.data.id),
          eq(budgetReservations.settled, false))).returning();
      if (!updated) throw new DomainError('Reservation not found or already settled', 404);
      return updated;
    }));
  });
  app.post('/api/projects/:id/llm-test', async (request, reply) => {
    const params = projectIdSchema.safeParse(request.params);
    const body = callSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'Invalid request' });
    const [project] = await db.select().from(projects).where(eq(projects.id, params.data.id));
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    return withProjectExecutionLock(db.$client, project.id, async () => {
      try {
        const response = await client.complete({
          projectId: project.id, purpose: 'test', model: settings.llmModel,
          messages: [{ role: 'user', content: body.data.prompt }], maxTokens: 512
        });
        return { response };
      } catch (error) {
        if (error instanceof BudgetError) return reply.code(409).send({ error: error.message });
        request.log.error(error, 'LLM call failed');
        return reply.code(502).send({ error: 'LLM call failed; consult server logs' });
      }
    });
  });
  app.get('/api/projects/:id/llm-calls', async (request, reply) => {
    const params = projectIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid project ID' });
    return db.select().from(llmCalls).where(eq(llmCalls.projectId, params.data.id)).orderBy(llmCalls.createdAt);
  });
  app.get('/api/projects/:id/memory', async (request, reply) => {
    const params = projectIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid project ID' });
    return getMemory(db, params.data.id);
  });
  app.get('/api/projects/:id/agents', async (request, reply) => {
    const params = projectIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid project ID' });
    return db.select().from(agents).where(eq(agents.projectId, params.data.id));
  });
  app.post('/api/projects/:id/agents', async (request, reply) => {
    const params = projectIdSchema.safeParse(request.params);
    const body = agentSchema.safeParse(request.body);
    if (!params.success || !body.success || body.data.kind !== 'analysis') {
      return reply.code(400).send({ error: 'Invalid analysis agent' });
    }
    return db.transaction(async tx => {
      await lockedProject(tx, params.data.id);
      await assertNoActiveTurn(tx, params.data.id);
      const [existing] = await tx.select({ id: agents.id }).from(agents)
        .where(and(eq(agents.projectId, params.data.id), eq(agents.key, body.data.key)));
      if (existing) throw new DomainError('Agent key already exists', 409);
      const agent = body.data;
      const [created] = await tx.insert(agents).values({
        projectId: params.data.id, key: agent.key, name: agent.name, kind: agent.kind,
        systemPrompt: agent.system_prompt, model: agent.model, params: agent.params,
        contextSpec: agent.context, schedule: agent.schedule, required: agent.required, enabled: agent.enabled
      }).returning();
      return reply.code(201).send(created);
    });
  });
  app.put('/api/agents/:id', async (request, reply) => {
    const params = projectIdSchema.safeParse(request.params);
    const body = agentSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'Invalid agent' });
    const [existing] = await db.select().from(agents).where(eq(agents.id, params.data.id));
    if (!existing) return reply.code(404).send({ error: 'Agent not found' });
    const agent = body.data;
    if (agent.key !== existing.key || agent.kind !== existing.kind ||
      (agent.kind === 'output' && agent.params.purpose !== (existing.params as { purpose?: string }).purpose) ||
      (agent.kind !== 'analysis' && !agent.enabled)) {
      return reply.code(400).send({ error: 'Key, kind and output purpose cannot change; core agents must remain enabled' });
    }
    return db.transaction(async tx => {
      await lockedProject(tx, existing.projectId);
      await assertNoActiveTurn(tx, existing.projectId);
      const [updated] = await tx.update(agents).set({
        name: agent.name, systemPrompt: agent.system_prompt, model: agent.model, params: agent.params,
        contextSpec: agent.context, schedule: agent.schedule, required: agent.required, enabled: agent.enabled
      }).where(eq(agents.id, existing.id)).returning();
      return updated;
    });
  });
  app.post('/api/projects/:id/seed/preview', async (request, reply) => {
    const params = projectIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid project ID' });
    const [project] = await db.select().from(projects).where(eq(projects.id, params.data.id));
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    const [global] = await db.select().from(globalSettings).where(eq(globalSettings.key, 'instructions'));
    const result = await withProjectExecutionLock(db.$client, project.id, () => client.complete({
      projectId: project.id, purpose: 'seed', model: settings.llmModel, maxTokens: 3000, timeoutMs: 90000,
      messages: [
        { role: 'system', content: `${global.value}\n\n${project.instructions}\n\nTransforme le document en propositions JSON {"proposals":[...]}. ${proposalInstructions}` },
        { role: 'user', content: project.worldMd }
      ], schema: proposalsSchema
    }));
    return result;
  });
  app.post('/api/projects/:id/seed/apply', async (request, reply) => {
    const params = projectIdSchema.safeParse(request.params);
    const body = z.object({ proposals: z.array(z.unknown()).max(100) }).strict().safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'Invalid request' });
    return db.transaction(async tx => {
      const project = await lockedProject(tx, params.data.id);
      await assertNoActiveTurn(tx, project.id);
      if (project.worldInitialized) throw new DomainError('World has already been initialized', 409);
      const branch = await ensureBranch(tx, project.id, project.activeBranchId);
      const result = await applyProposals(tx, { projectId: project.id, branchId: branch.branchId, state: branch.state,
        nextSeq: project.lastEventSeq, inputs: body.data.proposals, author: 'seed', evidence: project.worldMd });
      if (result.results.some(item => item.status === 'rejected')) {
        return { ...result, initialized: false };
      }
      await tx.update(projects).set({ worldInitialized: true }).where(eq(projects.id, project.id));
      return { ...result, initialized: true };
    });
  });
  app.post('/api/projects/:id/debug/proposals', async (request, reply) => {
    const params = projectIdSchema.safeParse(request.params);
    const body = z.object({ proposals: z.array(z.unknown()).min(1).max(100), turnId: z.string().uuid().optional() }).strict().safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'Invalid request' });
    return debugProposals(db, params.data.id, body.data.proposals, body.data.turnId);
  });
  app.get('/api/projects/:id/turns', async (request, reply) => {
    const params = projectIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid project ID' });
    const [project] = await db.select().from(projects).where(eq(projects.id, params.data.id));
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    if (!project.activeBranchId) return [];
    const history = await branchEvents(db, project.id, project.activeBranchId);
    const ids = history.filter(event => event.category === 'narrative').map(event => event.turnId).filter((id): id is string => !!id);
    const allTurns = await db.select().from(turns).where(eq(turns.projectId, project.id)).orderBy(turns.seq);
    return allTurns.filter(turn => ids.includes(turn.id) || (turn.branchId === project.activeBranchId && turn.status !== 'committed'));
  });
  app.post('/api/projects/:id/turns', async (request, reply) => {
    const params = projectIdSchema.safeParse(request.params);
    const body = z.object({ userInput: z.string().trim().min(1).max(20000), metaDirection: z.string().max(5000).optional() }).strict().safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'Invalid request' });
    try {
      return await withProjectExecutionLock(db.$client, params.data.id, async () => {
      const turn = await createTurn(db, params.data.id, body.data.userInput, body.data.metaDirection);
      reply.hijack();
      reply.raw.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', 'x-accel-buffering': 'no' });
      const send = (event: string, value: unknown) => {
        if (!reply.raw.destroyed) reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
      };
      try {
        await runTurn(db, client, turn, send);
      } catch (error) {
        request.log.error(error, 'Turn failed');
        await db.update(turns).set({ status: 'failed', error: 'Turn initialization failed' }).where(eq(turns.id, turn.id));
        send('error', { message: 'Turn initialization failed' });
      }
      });
    } finally {
      if (reply.raw.headersSent && !reply.raw.writableEnded) reply.raw.end();
    }
  });
  app.get('/api/turns/:id/debug', async (request, reply) => {
    const params = projectIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid turn ID' });
    const [turn] = await db.select().from(turns).where(eq(turns.id, params.data.id));
    if (!turn) return reply.code(404).send({ error: 'Turn not found' });
    const [whiteboard, calls, changes] = await Promise.all([
      db.select().from(whiteboardEntries).where(eq(whiteboardEntries.turnId, turn.id)),
      db.select().from(llmCalls).where(eq(llmCalls.turnId, turn.id)).orderBy(llmCalls.createdAt),
      db.select().from(proposals).where(eq(proposals.turnId, turn.id))
    ]);
    return { turn, whiteboard, calls, proposals: changes };
  });
  app.post('/api/turns/:id/retry-guardian', async (request, reply) => {
    const params = projectIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid turn ID' });
    const [turn] = await db.select().from(turns).where(eq(turns.id, params.data.id));
    if (!turn) return reply.code(404).send({ error: 'Turn not found' });
    return withProjectExecutionLock(db.$client, turn.projectId, async () => {
      const messages: { event: string; value: unknown }[] = [];
      await runGuardian(db, client, turn, (event, value) => messages.push({ event, value }));
      return { messages };
    });
  });
  app.post('/api/turns/:id/resume', async (request, reply) => {
    const params = projectIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid turn ID' });
    const [existing] = await db.select().from(turns).where(eq(turns.id, params.data.id));
    if (!existing) return reply.code(404).send({ error: 'Turn not found' });
    return withProjectExecutionLock(db.$client, existing.projectId, async () => {
      const [turn] = await db.select().from(turns).where(eq(turns.id, existing.id));
      if (!['pending', 'interpreting', 'analyzing', 'narrating', 'narrated', 'guarding'].includes(turn.status)) {
        throw new DomainError('Turn cannot be resumed', 409);
      }
      const messages: { event: string; value: unknown }[] = [];
      await runTurn(db, client, turn, (event, value) => messages.push({ event, value }));
      return { messages };
    });
  });
  app.get('/api/projects/:id/branches', async (request, reply) => {
    const params = projectIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid project ID' });
    return db.select().from(branches).where(eq(branches.projectId, params.data.id)).orderBy(branches.createdAt);
  });
  app.post('/api/projects/:id/rewind', async (request, reply) => {
    const params = projectIdSchema.safeParse(request.params);
    const body = z.object({ turnId: z.string().uuid() }).strict().safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'Invalid request' });
    return rewind(db, params.data.id, body.data.turnId);
  });
  app.post('/api/projects/:id/branches/:branchId/activate', async (request, reply) => {
    const params = z.object({ id: z.string().uuid(), branchId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid request' });
    return switchBranch(db, params.data.id, params.data.branchId);
  });
  return app;
}

function extractInstructions(markdown: string): string {
  const sections = markdown.split(/(?=^#{1,2}\s)/m);
  return sections.filter(section => /^#{1,2}\s+(pitch|style)\b/im.test(section)).join('\n\n').trim();
}
