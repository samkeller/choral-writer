import { readFile } from 'node:fs/promises';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { LlmClient } from '@choral/engine';
import type { Pool } from 'pg';
import { globalSettings } from './schema.js';
import { BudgetError, budgetHooks } from './budget.js';
import { registerAgentRoutes } from './routes/agents.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerBranchRoutes } from './routes/branches.js';
import { registerMemoryRoutes } from './routes/memory.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerTurnRoutes } from './routes/turns.js';
import type { Settings } from './routes/types.js';
import { DomainError } from './memory.js';

export type { Settings } from './routes/types.js';

export async function buildApp(
  db: NodePgDatabase & { $client: Pool },
  settings: Settings,
  fetcher: typeof fetch = fetch,
) {
  const globalInstructions = await readFile(new URL('../../../config/global.md', import.meta.url), 'utf8');
  await db
    .insert(globalSettings)
    .values({ key: 'instructions', value: globalInstructions })
    .onConflictDoNothing();
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
  const dependencies = { db, client, settings };

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof DomainError) return reply.code(error.statusCode).send({ error: error.message });
    if (error instanceof BudgetError) return reply.code(409).send({ error: error.message });
    request.log.error(error);
    return reply.code(500).send({ error: 'Internal server error' });
  });

  registerAuthRoutes(app, settings);
  registerProjectRoutes(app, dependencies);
  registerAgentRoutes(app, dependencies);
  registerMemoryRoutes(app, dependencies);
  registerTurnRoutes(app, dependencies);
  registerBranchRoutes(app, dependencies);
  return app;
}
