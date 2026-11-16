import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import type { ChatCompletionChunk } from 'openai/resources/chat/completions';
import { APIError } from 'openai/error';
import { chatEventSchema, messageSchema, projectSchema } from '@choral-writer/shared';

import { buildApp } from '../../app.js';
import * as schema from '../../db/schema.js';
import { createCallLLM } from '../../llm/call-llm.js';
import { createTurnsService } from '../turns/service.js';
import { createProjectsService } from './service.js';

// Only run against an explicitly supplied disposable PostgreSQL database.
describe.skipIf(!process.env.TEST_DATABASE_URL)('projects and chat with PostgreSQL', () => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const database = drizzle(pool, { schema });
  let generate: (signal?: AbortSignal) => AsyncGenerator<ChatCompletionChunk> = async function* () {
    yield chunk('Bonjour ');
    yield chunk('Mara.');
    yield chunk('', 'stop');
  };
  const create = vi.fn(async (_params: unknown, options?: { signal?: AbortSignal }) => generate(options?.signal));
  const callLLM = createCallLLM({
    client: { chat: { completions: { create } } },
    model: 'simulated-model',
    traces: {
      insert: async ({ messages, ...trace }) => {
        await database.insert(schema.llmCall).values({ ...trace, request: { messages } });
      },
    },
  });
  const projects = createProjectsService(database);
  const app = buildApp({
    appPassword: 'test-password',
    cookieSecret: 'test-cookie-secret-with-at-least-thirty-two-characters',
    nodeEnv: 'test',
  }, { projects, turns: createTurnsService(database, projects, callLLM) });
  let cookie: string;
  let address: string;
  const createdIds: string[] = [];

  function chunk(content: string, finish_reason: 'stop' | null = null): ChatCompletionChunk {
    return {
      id: 'stream', object: 'chat.completion.chunk', created: 0, model: 'simulated-model',
      choices: [{ index: 0, delta: { content }, finish_reason }],
      ...(finish_reason ? { usage: { prompt_tokens: 20, completion_tokens: 4, total_tokens: 24 } } : {}),
    };
  }

  async function createProject(name: string, systemPrompt = 'Tu es le narrateur de ce monde.') {
    const response = await app.inject({
      method: 'POST', url: '/api/projects', headers: { cookie },
      payload: { name, systemPrompt },
    });
    expect(response.statusCode).toBe(201);
    const project = projectSchema.parse(response.json());
    createdIds.push(project.id);
    return project;
  }

  function events(payload: string) {
    return payload.split('\n').filter((line) => line.startsWith('data: '))
      .map((line) => chatEventSchema.parse(JSON.parse(line.slice(6))));
  }

  async function send(id: string, content: string) {
    return app.inject({
      method: 'POST', url: `/api/projects/${id}/turns`,
      headers: { cookie }, payload: { content },
    });
  }

  beforeAll(async () => {
    await migrate(database, {
      migrationsFolder: './src/db/migrations',
      migrationsSchema: 'choral_writer',
    });
    address = await app.listen({ host: '127.0.0.1', port: 0 });
    const login = await app.inject({
      method: 'POST', url: '/api/login', payload: { password: 'test-password' },
    });
    cookie = login.cookies.map((item) => `${item.name}=${item.value}`).join('; ');
  }, 15_000);

  afterAll(async () => {
    await app.close();
    for (const id of createdIds) {
      await database.delete(schema.projects).where(eq(schema.projects.id, id));
    }
    await pool.end();
  });

  it('validates authenticated CRUD and preserves the system prompt', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/projects' })).statusCode).toBe(401);
    expect((await app.inject({
      method: 'GET', url: '/api/projects/not-a-uuid', headers: { cookie },
    })).statusCode).toBe(400);
    expect((await app.inject({
      method: 'POST', url: '/api/projects', headers: { cookie },
      payload: { name: ' ', systemPrompt: '' },
    })).statusCode).toBe(400);

    const project = await createProject('Premier projet');
    const update = await app.inject({
      method: 'PUT', url: `/api/projects/${project.id}`, headers: { cookie },
      payload: { name: 'Nouveau nom', systemPrompt: 'Réponds en une phrase.' },
    });
    expect(projectSchema.parse(update.json()).systemPrompt).toBe('Réponds en une phrase.');
    const list = await app.inject({ method: 'GET', url: '/api/projects', headers: { cookie } });
    expect(projectSchema.array().parse(list.json()).some((row) => row.name === 'Nouveau nom')).toBe(true);
    expect((await app.inject({
      method: 'DELETE', url: `/api/projects/${project.id}`, headers: { cookie },
    })).statusCode).toBe(204);
    expect((await app.inject({
      method: 'GET', url: `/api/projects/${project.id}`, headers: { cookie },
    })).statusCode).toBe(404);
  });

  it('streams, persists history, reuses context, isolates projects, and saves the LLM trace', async () => {
    const first = await createProject('Monde A', 'Tu es le narrateur A.');
    const second = await createProject('Monde B', 'Tu es le narrateur B.');
    const response = await send(first.id, 'Mara entre.');
    expect(response.statusCode).toBe(200);
    const output = events(response.body);
    expect(output.map((event) => event.type)).toEqual([
      'chat.turn.started', 'chat.message.delta', 'chat.message.delta', 'chat.turn.completed',
    ]);
    const history = await app.inject({
      method: 'GET', url: `/api/projects/${first.id}/messages`, headers: { cookie },
    });
    expect(messageSchema.array().parse(history.json()).map(({ role, content }) => ({ role, content })))
      .toEqual([{ role: 'user', content: 'Mara entre.' }, { role: 'assistant', content: 'Bonjour Mara.' }]);
    const start = output[0];
    if (start.type !== 'chat.turn.started') throw new Error('Missing start event.');
    const [trace] = await database.select().from(schema.llmCall).where(eq(schema.llmCall.turnId, start.turnId));
    expect(trace).toMatchObject({
      response: 'Bonjour Mara.', status: 'success', model: 'simulated-model', inputTokens: 20,
    });
    const [turn] = await database.select().from(schema.turns).where(eq(schema.turns.id, start.turnId));
    expect(turn.status).toBe('completed');
    await send(first.id, 'Elle avance.');
    expect(create).toHaveBeenLastCalledWith(expect.objectContaining({
      messages: [
        { role: 'system', content: 'Tu es le narrateur A.' },
        { role: 'user', content: 'Mara entre.' },
        { role: 'assistant', content: 'Bonjour Mara.' },
        { role: 'user', content: 'Elle avance.' },
      ],
    }), expect.anything());
    await send(second.id, 'Une autre histoire.');
    expect(create).toHaveBeenLastCalledWith(expect.objectContaining({
      messages: [
        { role: 'system', content: 'Tu es le narrateur B.' },
        { role: 'user', content: 'Une autre histoire.' },
      ],
    }), expect.anything());

    await projects.remove(first.id);
    expect(await database.select().from(schema.messages).where(eq(schema.messages.projectId, first.id))).toEqual([]);
    expect(await database.select().from(schema.turns).where(eq(schema.turns.projectId, first.id))).toEqual([]);
  });

  it('retains the user message and failure trace but never persists a partial assistant reply', async () => {
    const project = await createProject('Erreur fournisseur');
    const normal = generate;
    generate = async function* () {
      yield chunk('Réponse partielle');
      throw APIError.generate(402, { error: { message: 'Insufficient Balance' } }, undefined, new Headers({
        'x-request-id': 'simulated-provider-request',
      }));
    };
    try {
      const response = await send(project.id, 'Bonjour.');
      expect(events(response.body).at(-1)).toMatchObject({
        type: 'chat.turn.failed',
        error: {
          code: 'LLM_INSUFFICIENT_BALANCE', message: 'Insufficient Balance',
          source: 'llm', status: 402, requestId: 'simulated-provider-request',
        },
      });
      const history = await database.select().from(schema.messages).where(eq(schema.messages.projectId, project.id));
      expect(history.map((message) => message.role)).toEqual(['user']);
      const [turn] = await database.select().from(schema.turns).where(eq(schema.turns.projectId, project.id));
      expect(turn.status).toBe('failed');
      const [trace] = await database.select().from(schema.llmCall).where(eq(schema.llmCall.turnId, turn.id));
      expect(trace).toMatchObject({ status: 'error', response: 'Réponse partielle' });
    } finally {
      generate = normal;
    }
    expect(events((await send(project.id, 'Reprenons.')).body).at(-1)?.type).toBe('chat.turn.completed');
  });

  it('delivers deltas before completion and rejects competing turns and mutations', async () => {
    const project = await createProject('Concurrence');
    const normal = generate;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    generate = async function* () {
      yield chunk('Début');
      await gate;
      yield chunk(' de la réponse.');
      yield chunk('', 'stop');
    };
    try {
      const response = await fetch(`${address}/api/projects/${project.id}/turns`, {
        method: 'POST', headers: { cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Commence.' }),
      });
      if (!response.body) throw new Error('Missing response body.');
      const reader = response.body.getReader();
      let received = '';
      while (!received.includes('chat.message.delta')) {
        const { value, done } = await reader.read();
        if (done) throw new Error('Stream ended too early.');
        received += new TextDecoder().decode(value);
      }
      expect(received).not.toContain('chat.turn.completed');
      expect((await send(project.id, 'En parallèle.')).statusCode).toBe(409);
      expect((await app.inject({
        method: 'PUT', url: `/api/projects/${project.id}`, headers: { cookie },
        payload: { name: 'Modification', systemPrompt: '' },
      })).statusCode).toBe(409);
      expect((await app.inject({
        method: 'DELETE', url: `/api/projects/${project.id}`, headers: { cookie },
      })).statusCode).toBe(409);
      release();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        received += new TextDecoder().decode(value);
      }
      expect(events(received).at(-1)?.type).toBe('chat.turn.completed');
      reader.releaseLock();
    } finally {
      release();
      generate = normal;
    }
  });

  it('aborts generation when the client disconnects and persists the failed turn', async () => {
    const project = await createProject('Déconnexion');
    const normal = generate;
    const controller = new AbortController();
    generate = async function* (signal) {
      yield chunk('Début de réponse');
      if (!signal) throw new Error('Missing LLM abort signal.');
      await new Promise<void>((resolve) => {
        signal.addEventListener('abort', () => resolve(), { once: true });
        if (signal.aborted) resolve();
      });
      signal.throwIfAborted();
    };
    try {
      const response = await fetch(`${address}/api/projects/${project.id}/turns`, {
        method: 'POST', headers: { cookie, 'Content-Type': 'application/json' },
        signal: controller.signal, body: JSON.stringify({ content: 'Bonjour.' }),
      });
      if (!response.body) throw new Error('Missing response body.');
      const reader = response.body.getReader();
      let received = '';
      while (!received.includes('chat.message.delta')) {
        const { value, done } = await reader.read();
        if (done) throw new Error('Stream ended too early.');
        received += new TextDecoder().decode(value);
      }
      await reader.cancel();
      reader.releaseLock();
      await vi.waitFor(async () => {
        const [turn] = await database.select().from(schema.turns).where(eq(schema.turns.projectId, project.id));
        expect(turn?.status).toBe('failed');
      });
      const history = await database.select().from(schema.messages).where(eq(schema.messages.projectId, project.id));
      expect(history.map((message) => message.role)).toEqual(['user']);
    } finally {
      controller.abort();
      generate = normal;
    }
  });
});
