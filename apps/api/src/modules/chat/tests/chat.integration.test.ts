import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq } from 'drizzle-orm';
import type {
  ChatCompletion, ChatCompletionChunk, ChatCompletionCreateParamsNonStreaming, ChatCompletionCreateParamsStreaming,
} from 'openai/resources/chat/completions';
import { APIError } from 'openai/error';
import { v7 as uuidv7 } from 'uuid';
import {
  agentSchema, projectAgentSchema, chatEventSchema, chatHistorySchema, projectSchema,
  traceCallDetailSchema, turnTraceSummarySchema,
  memoryViewSchema, memoryTraceSchema, type MemoryMutation, type MemoryProposal,
} from '@choral-writer/shared';

import { buildApp } from '../../../app.js';
import * as schema from '../../../db/schema.js';
import { createTestPool } from '../../../tests/testDb.js';
import { createCallLLM } from '../../../llm/call-llm.js';
import { testProvider } from '../../../tests/support/callLLM.js';
import { createUsageService } from '../../../llm/usage/usageService.js';
import { createChatBranchService, createChatService } from '../index.js';
import { ChatMessageService } from '../services/messageService.js';
import { ChatTurnService } from '../services/turnService.js';
import { ChatMessageRepository } from '../repositories/messageRepository.js';
import { ChatTurnRepository } from '../repositories/turnRepository.js';
import { AgentsService } from '../../agents/services/agentsService.js';
import { ProjectsService } from '../../projects/services/projectServices.js';
import { createTraceService } from '../../traces/index.js';
import { MemoriesService } from '../../memories/services/memoriesService.js';

// Only run against an explicitly supplied disposable PostgreSQL database.
describe.skipIf(!process.env.DATABASE_URL)('projects and chat with PostgreSQL', () => {
  const pool = createTestPool();
  const database = drizzle(pool, { schema });
  const analysisContent = JSON.stringify({
    v: 1, agent: 'Chaos', summary: 'There may be a trap.', items: [
      { kind: 'observation', text: 'A wire is visible.', importance: 'HIGH' },
    ],
  });
  let guardianOutput: string | null = null;
  let setupOutput: string | null = null;
  let generate: (signal?: AbortSignal) => AsyncGenerator<ChatCompletionChunk> = async function* () {
    yield chunk('<resolution>La porte s’ouvre.</resolution><prose>Bonjour ');
    yield chunk('Mara.</prose>');
    yield chunk('', 'stop');
  };
  const create = vi.fn(async (
    params: ChatCompletionCreateParamsNonStreaming | ChatCompletionCreateParamsStreaming,
    options?: { signal?: AbortSignal },
  ): Promise<ChatCompletion | AsyncIterable<ChatCompletionChunk>> => {
    if (params.stream) return generate(options?.signal);
    const system = params.messages[0]?.content;
    const content = typeof system === 'string' && system.includes('Propose a compact memory routing configuration')
      ? setupOutput ?? '{}' : typeof system === 'string' && system.includes('Maintain memory from established narrative events')
        ? guardianOutput ?? analysisContent : analysisContent;
    return {
      id: 'analysis', object: 'chat.completion', created: 0, model: 'simulated-model',
      choices: [{
        index: 0, finish_reason: 'stop', logprobs: null,
        message: { role: 'assistant', content, refusal: null, annotations: [] },
      }],
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
  const chat = createChatService(database, projects, callLLM, memories);
  const app = buildApp({
    appPassword: 'test-password',
    cookieSecret: 'test-cookie-secret-with-at-least-thirty-two-characters',
    nodeEnv: 'test',
  }, { projects, agents, chat, traces: createTraceService(database, chat), memories });
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
    const project = await projects.get(id);
    if (!project.defaultBranchId) throw new Error('Missing default branch.');
    return sendOnBranch(id, project.defaultBranchId, content);
  }

  async function narratorPrompt(projectId: string): Promise<string> {
    const project = await projects.get(projectId);
    const narrator = (await agents.listForProject(projectId)).find((agent) => agent.output === 'narrative');
    if (!narrator) throw new Error('Missing narrator assignment.');
    return [
      [project.systemPrompt, narrator.instructions].filter(Boolean).join('\n\n'),
      'Use the validated analysis envelopes below as context. Return exactly one <resolution> section followed by one <prose> section, with no text outside those tags.',
      '[]',
    ].filter(Boolean).join('\n\n');
  }

  async function sendOnBranch(projectId: string, branchId: string, content: string) {
    const [branch] = await database.select().from(schema.chatBranches)
      .where(eq(schema.chatBranches.id, branchId));
    return app.inject({
      method: 'POST', url: `/api/projects/${projectId}/branches/${branch.id}/turns`,
      headers: { cookie }, payload: { content, expectedHeadTurnId: branch.headTurnId },
    });
  }

  async function history(projectId: string, branchId: string) {
    const response = await app.inject({
      method: 'GET', url: `/api/projects/${projectId}/branches/${branchId}/history`, headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    return chatHistorySchema.parse(response.json());
  }

  async function repeat(
    projectId: string, branchId: string, turnId: string, operation: 'regenerate' | 'retry',
  ) {
    return app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/branches/${branchId}/turns/${turnId}/${operation}`,
      headers: { cookie }, payload: { expectedHeadTurnId: turnId },
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

  it('shares agents across projects, pins immutable versions and applies only explicit upgrades', async () => {
    const project = await createProject('Agents');
    const second = await createProject('Autre équipe');
    expect((await app.inject({
      method: 'GET', url: '/api/agents',
    })).statusCode).toBe(401);
    const listResponse = await app.inject({
      method: 'GET', url: `/api/projects/${project.id}/agents`, headers: { cookie },
    });
    const defaults = projectAgentSchema.array().parse(listResponse.json());
    expect(defaults).toEqual(expect.arrayContaining([
      expect.objectContaining({ phase: 'restitution', output: 'narrative' }),
      expect.objectContaining({ phase: 'restitution', output: 'memory_proposals' }),
    ]));
    const narrator = defaults.find((agent) => agent.output === 'narrative');
    if (!narrator) throw new Error('Missing default narrator.');
    const newAgent = agentSchema.parse((await app.inject({
      method: 'POST', url: '/api/agents', headers: { cookie },
      payload: {
        name: 'Réponse personnalisée', phase: 'restitution', output: 'narrative', instructions: 'Ton initial.',
      },
    })).json());
    const initial = newAgent.versions[0]!;
    const selections = defaults.map((agent) => agent.output === 'narrative'
      ? { agentId: newAgent.id, versionId: initial.id }
      : { agentId: agent.agentId, versionId: agent.versionId });
    for (const id of [project.id, second.id]) {
      expect((await app.inject({
        method: 'PUT', url: `/api/projects/${id}/agents`, headers: { cookie }, payload: { agents: selections },
      })).statusCode).toBe(200);
    }
    const updated = await app.inject({
      method: 'POST', url: `/api/agents/${newAgent.id}/versions`, headers: { cookie },
      payload: { name: 'Réponse personnalisée', instructions: 'Ton enjoué.', expectedVersion: 1 },
    });
    expect(updated.statusCode).toBe(201);
    const published = agentSchema.parse(updated.json());
    expect(published.versions.map((version) => version.version)).toEqual([2, 1]);
    expect(published.projects).toHaveLength(2);
    expect((await app.inject({
      method: 'POST', url: `/api/agents/${newAgent.id}/versions`, headers: { cookie },
      payload: { name: 'Obsolète', instructions: '', expectedVersion: 1 },
    })).statusCode).toBe(409);
    expect((await app.inject({
      method: 'DELETE', url: `/api/agents/${newAgent.id}`, headers: { cookie },
    })).statusCode).toBe(409);
    await expect(database.update(schema.agentVersions).set({ instructions: 'Mutation interdite' })
      .where(eq(schema.agentVersions.id, initial.id))).rejects.toThrow();
    await send(project.id, 'Avant mise à jour.');
    expect(create).toHaveBeenLastCalledWith(expect.objectContaining({
      messages: expect.arrayContaining([{
        role: 'system',
        content: expect.stringContaining(`${project.systemPrompt}\n\nTon initial.`),
      }]),
    }), expect.anything());
    const nextVersion = published.versions[0]!;
    expect((await app.inject({
      method: 'PUT', url: `/api/projects/${project.id}/agents`, headers: { cookie },
      payload: { agents: selections.map((agent) => agent.agentId === newAgent.id
        ? { ...agent, versionId: nextVersion.id } : agent) },
    })).statusCode).toBe(200);
    await send(project.id, 'La porte s’ouvre.');
    expect(create).toHaveBeenLastCalledWith(expect.objectContaining({
      messages: expect.arrayContaining([{
        role: 'system',
        content: expect.stringContaining(`${project.systemPrompt}\n\nTon enjoué.`),
      }]),
    }), expect.anything());
    const other = await agents.listForProject(second.id);
    expect(other.find((agent) => agent.agentId === newAgent.id)?.versionId).toBe(initial.id);
  });

  it('rejects missing, duplicate and mismatched restitution contracts without changing the team', async () => {
    const project = await createProject('Contrats');
    const before = await agents.listForProject(project.id);
    const [first, second] = before;
    if (!first || !second) throw new Error('Missing required agents.');
    const extra = await agents.create({
      name: 'Autre réponse', instructions: '', phase: 'restitution', output: 'narrative',
    });
    for (const selection of [
      [],
      [first],
      [first, first, second],
      [{ ...first, versionId: second.versionId }, second],
      [...before, { agentId: extra.id, versionId: extra.versions[0]!.id }],
    ]) {
      const response = await app.inject({
        method: 'PUT', url: `/api/projects/${project.id}/agents`, headers: { cookie },
        payload: { agents: selection.map(({ agentId, versionId }) => ({ agentId, versionId })) },
      });
      expect(response.statusCode).toBe(400);
      expect(await agents.listForProject(project.id)).toEqual(before);
    }
    await expect(database.delete(schema.projectAgents)
      .where(eq(schema.projectAgents.projectId, project.id))).rejects.toThrow();
    await expect(database.update(schema.agents).set({ phase: 'analysis', output: 'envelope' })
      .where(eq(schema.agents.id, extra.id))).rejects.toThrow();
    expect((await app.inject({
      method: 'DELETE', url: `/api/agents/${extra.id}`, headers: { cookie },
    })).statusCode).toBe(204);
    const invalid = await app.inject({
      method: 'POST', url: '/api/agents', headers: { cookie },
      payload: { name: 'Invalide', instructions: '', phase: 'analysis', output: 'narrative' },
    });
    expect(invalid.statusCode).toBe(400);
  });

  it('pins the latest built-in versions only when a new project is created', async () => {
    const existing = await createProject('Avant publication');
    const before = await agents.listForProject(existing.id);
    for (const assignment of before) {
      const libraryAgent = (await agents.list()).find((agent) => agent.id === assignment.agentId);
      if (!libraryAgent) throw new Error('Missing built-in agent.');
      await agents.publish(assignment.agentId, {
        name: assignment.name, instructions: assignment.instructions, expectedVersion: libraryAgent.versions[0]!.version,
      });
    }
    const fresh = await createProject('Après publication');
    const after = await agents.listForProject(fresh.id);
    expect(after.map((agent) => agent.version)).toEqual(before.map((agent) => agent.version + 1));
    expect(await agents.listForProject(existing.id)).toEqual(before);
  });

  it('streams, persists history, reuses context, isolates projects, and saves the LLM trace', async () => {
    const first = await createProject('Monde A', 'Tu es le narrateur A.');
    const second = await createProject('Monde B', 'Tu es le narrateur B.');
    const response = await send(first.id, 'Mara entre.');
    expect(response.statusCode).toBe(200);
    const output = events(response.body);
    expect(output.map((event) => event.type)).toEqual([
      'chat.turn.started',
      'chat.pipeline.stage', 'chat.pipeline.stage',
      'chat.pipeline.stage',
      'chat.message.delta', 'chat.message.delta',
      'chat.pipeline.stage', 'chat.turn.completed',
    ]);
    const history = await app.inject({
      method: 'GET', url: `/api/projects/${first.id}/branches/${first.defaultBranchId}/history`, headers: { cookie },
    });
    expect(chatHistorySchema.parse(history.json()).turns.flatMap((turn) =>
      [turn.userMessage, ...(turn.assistantMessage ? [turn.assistantMessage] : [])])
      .map(({ role, content }) => ({ role, content })))
      .toEqual([{ role: 'user', content: 'Mara entre.' }, { role: 'assistant', content: 'Bonjour Mara.' }]);
    const start = output[0];
    if (start.type !== 'chat.turn.started') throw new Error('Missing start event.');
    const [trace] = await database.select().from(schema.llmCall).where(eq(schema.llmCall.turnId, start.turnId));
    const narrator = (await agents.listForProject(first.id)).find((agent) => agent.output === 'narrative');
    expect(trace).toMatchObject({
      response: '<resolution>La porte s’ouvre.</resolution><prose>Bonjour Mara.</prose>',
      agentId: narrator?.agentId, agentVersionId: narrator?.versionId,
      status: 'success', model: 'simulated-model', inputTokens: 20,
    });
    const traceSummaryResponse = await app.inject({
      method: 'GET', url: `/api/projects/${first.id}/turns/${start.turnId}/traces`, headers: { cookie },
    });
    expect(traceSummaryResponse.statusCode).toBe(200);
    const traceSummary = turnTraceSummarySchema.parse(traceSummaryResponse.json());
    expect(traceSummary).toMatchObject({
      turnId: start.turnId,
      analysis: [],
      narrator: { status: 'success', resolution: 'La porte s’ouvre.', prose: 'Bonjour Mara.' },
    });
    // The simulated model has no price grid: its usage is recorded, but the turn total is partial.
    expect(traceSummary.calls.map((call) => call.costBasis)).toEqual(traceSummary.calls.map(() => 'unpriced'));
    expect(traceSummary.cost).toEqual({ microUsd: 0, complete: false });
    const traceDetailResponse = await app.inject({
      method: 'GET',
      url: `/api/projects/${first.id}/turns/${start.turnId}/traces/${trace.id}`,
      headers: { cookie },
    });
    expect(traceDetailResponse.statusCode).toBe(200);
    const traceDetail = traceCallDetailSchema.parse(traceDetailResponse.json());
    expect(traceDetail).toMatchObject({
      id: trace.id,
      response: '<resolution>La porte s’ouvre.</resolution><prose>Bonjour Mara.</prose>',
    });
    expect(traceDetail.request.messages).toEqual(expect.arrayContaining([
      { role: 'system', content: expect.any(String) },
      { role: 'user', content: 'Mara entre.' },
    ]));
    const foreignTrace = await app.inject({
      method: 'GET', url: `/api/projects/${second.id}/turns/${start.turnId}/traces`, headers: { cookie },
    });
    expect(foreignTrace.statusCode).toBe(404);
    const [turn] = await database.select().from(schema.chatTurns).where(eq(schema.chatTurns.id, start.turnId));
    expect(turn.status).toBe('completed');
    await send(first.id, 'Elle avance.');
    expect(create).toHaveBeenLastCalledWith(expect.objectContaining({
      messages: [
        { role: 'system', content: await narratorPrompt(first.id) },
        { role: 'user', content: 'Mara entre.' },
        { role: 'assistant', content: 'Bonjour Mara.' },
        { role: 'user', content: 'Elle avance.' },
      ],
    }), expect.anything());
    await send(second.id, 'Une autre histoire.');
    expect(create).toHaveBeenLastCalledWith(expect.objectContaining({
      messages: [
        { role: 'system', content: await narratorPrompt(second.id) },
        { role: 'user', content: 'Une autre histoire.' },
      ],
    }), expect.anything());

    await projects.remove(first.id);
    expect(await database.select().from(schema.chatMessages).where(eq(schema.chatMessages.projectId, first.id))).toEqual([]);
    expect(await database.select().from(schema.chatTurns).where(eq(schema.chatTurns.projectId, first.id))).toEqual([]);
  });

  it('runs configured analysis agents and traces the pinned versions before narration', async () => {
    const project = await createProject('Analyse');
    const defaults = await agents.listForProject(project.id);
    const analyst = await agents.create({
      name: 'Chaos', instructions: 'Find uncertainty.', phase: 'analysis', output: 'envelope',
    });
    const analysisVersion = analyst.versions[0];
    if (!analysisVersion) throw new Error('Missing analysis agent version.');
    await agents.configure(project.id, {
      agents: [
        ...defaults.map(({ agentId, versionId }) => ({ agentId, versionId })),
        { agentId: analyst.id, versionId: analysisVersion.id },
      ],
    });

    const response = await send(project.id, 'J’ouvre la porte.');
    const output = events(response.body);
    const start = output.find((event) => event.type === 'chat.turn.started');
    if (start?.type !== 'chat.turn.started') throw new Error('Missing started turn.');
    const traces = await database.select().from(schema.llmCall).where(eq(schema.llmCall.turnId, start.turnId));
    expect(traces).toHaveLength(2);
    expect(traces).toEqual(expect.arrayContaining([
      expect.objectContaining({
        agentId: analyst.id,
        agentVersionId: analysisVersion.id,
        stage: 'analysis',
        status: 'success',
        response: analysisContent,
      }),
      expect.objectContaining({
        agentId: expect.any(String),
        agentVersionId: expect.any(String),
        stage: 'narrator',
        status: 'success',
      }),
    ]));
    const summary = await app.inject({
      method: 'GET', url: `/api/projects/${project.id}/turns/${start.turnId}/traces`, headers: { cookie },
    });
    expect(turnTraceSummarySchema.parse(summary.json()).analysis).toMatchObject([
      { name: 'Chaos', status: 'success', envelope: { summary: 'There may be a trap.' } },
    ]);
    const narratorCall = create.mock.calls.at(-1)?.[0];
    expect(String(narratorCall?.messages[0]?.content)).toContain('"agent":"Chaos"');
  });

  it('retains the user message and failure trace but never persists a partial assistant reply', async () => {
    const project = await createProject('Erreur fournisseur');
    const normal = generate;
    generate = async function* () {
      yield chunk('<resolution>Faits.</resolution><prose>Réponse partielle');
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
      const history = await database.select().from(schema.chatMessages).where(eq(schema.chatMessages.projectId, project.id));
      expect(history.map((message) => message.role)).toEqual(['user']);
      const [turn] = await database.select().from(schema.chatTurns).where(eq(schema.chatTurns.projectId, project.id));
      expect(turn.status).toBe('failed');
      const [trace] = await database.select().from(schema.llmCall).where(eq(schema.llmCall.turnId, turn.id));
      expect(trace).toMatchObject({
        status: 'error',
        response: '<resolution>Faits.</resolution><prose>Réponse partielle',
      });
    } finally {
      generate = normal;
    }
    expect(events((await send(project.id, 'Reprenons.')).body).at(-1)?.type).toBe('chat.turn.completed');
  });

  it('refuses to finalize a terminal turn again and rolls back the replacement message', async () => {
    const project = await createProject('Exécution immuable');
    const completed = events((await send(project.id, 'Bonjour.')).body).at(-1);
    if (completed?.type !== 'chat.turn.completed') throw new Error('Missing completed turn.');
    const before = await history(project.id, completed.branchId);

    await expect(projects.withLockedProject(project.id, async (_project, tx) => {
      const messages = new ChatMessageService(new ChatMessageRepository(tx, project.id));
      const turns = new ChatTurnService(new ChatTurnRepository(tx, project.id));
      const at = new Date();
      const message = await messages.createAssistant('Ne pas remplacer la réponse.', at);
      await turns.finish(completed.turnId, completed.branchId, {
        status: 'completed', turnId: completed.turnId, branchId: completed.branchId, message,
      }, at);
    })).rejects.toThrow('Cannot finish a missing or terminal chat turn');

    expect(await history(project.id, completed.branchId)).toEqual(before);
    const messages = await database.select().from(schema.chatMessages)
      .where(eq(schema.chatMessages.projectId, project.id));
    expect(messages).toHaveLength(2);
    expect(messages.some((message) => message.content === 'Ne pas remplacer la réponse.')).toBe(false);
  });

  it('forks shared ancestry, excludes the old answer, and continues both branches independently', async () => {
    const project = await createProject('Branches', 'Prompt courant.');
    const normal = generate;
    try {
      await send(project.id, 'Premier message.');
      const originalOutput = events((await send(project.id, 'Deuxième message.')).body);
      const original = originalOutput.at(-1);
      if (original?.type !== 'chat.turn.completed') throw new Error('Missing completed turn.');
      const before = await history(project.id, original.branchId);
      const previousCalls = create.mock.calls.length;
      await projects.update(project.id, { name: project.name, systemPrompt: 'Prompt modifié.' });
      generate = async function* () {
        yield chunk('<resolution>Alternative.</resolution><prose>Réponse alternative.');
        yield chunk('</prose>');
        yield chunk('', 'stop');
      };
      const regenerated = events((await repeat(
        project.id, original.branchId, original.turnId, 'regenerate',
      )).body).at(-1);
      if (regenerated?.type !== 'chat.turn.completed') throw new Error('Missing regenerated turn.');

      expect(regenerated.branchId).not.toBe(original.branchId);
      expect(create.mock.calls.length).toBe(previousCalls + 1);
      expect(create).toHaveBeenLastCalledWith(expect.objectContaining({
        messages: [
          { role: 'system', content: await narratorPrompt(project.id) },
          { role: 'user', content: 'Premier message.' },
          { role: 'assistant', content: 'Bonjour Mara.' },
          { role: 'user', content: 'Deuxième message.' },
        ],
      }), expect.anything());
      const alternative = await history(project.id, regenerated.branchId);
      expect(alternative.branch).toMatchObject({
        sourceBranchId: original.branchId, forkTurnId: before.turns[0].id,
      });
      expect(alternative.turns[0]).toEqual(before.turns[0]);
      expect(alternative.turns[1]).toMatchObject({
        regeneratedFromTurnId: original.turnId,
        parentTurnId: before.turns[0].id,
        userMessage: before.turns[1].userMessage,
      });
      expect(await history(project.id, original.branchId)).toEqual(before);
      const userRows = await database.select().from(schema.chatMessages)
        .where(eq(schema.chatMessages.projectId, project.id));
      expect(userRows.filter((row) => row.role === 'user')).toHaveLength(2);
      const traces = await database.select().from(schema.llmCall)
        .where(eq(schema.llmCall.turnId, regenerated.turnId));
      expect(traces).toHaveLength(1);

      await sendOnBranch(project.id, regenerated.branchId, 'Suite alternative.');
      expect(create).toHaveBeenLastCalledWith(expect.objectContaining({
        messages: expect.arrayContaining([{ role: 'assistant', content: 'Réponse alternative.' }]),
      }), expect.anything());
      await sendOnBranch(project.id, original.branchId, 'Suite originale.');
      const last = create.mock.calls.at(-1)?.[0];
      expect(last).not.toEqual(expect.objectContaining({
        messages: expect.arrayContaining([{ role: 'assistant', content: 'Réponse alternative.' }]),
      }));
      expect((await history(project.id, regenerated.branchId)).turns.at(-1)?.userMessage.content)
        .toBe('Suite alternative.');
      expect((await repeat(project.id, original.branchId, original.turnId, 'regenerate')).statusCode).toBe(409);
    } finally {
      generate = normal;
    }
  });

  it('preserves a failed alternative and retries it without overwriting or repeating the user input', async () => {
    const project = await createProject('Retry');
    const original = events((await send(project.id, 'Même saisie.')).body).at(-1);
    if (original?.type !== 'chat.turn.completed') throw new Error('Missing source turn.');
    const normal = generate;
    let failedTurnId: string;
    let alternativeId: string;
    generate = async function* () {
      yield chunk('<resolution>Faits.</resolution><prose>Partiel.');
      throw new Error('simulated failure');
    };
    try {
      const failed = events((await repeat(project.id, original.branchId, original.turnId, 'regenerate')).body).at(-1);
      if (failed?.type !== 'chat.turn.failed' || !failed.turnId || !failed.branchId) {
        throw new Error('Missing failed alternative.');
      }
      failedTurnId = failed.turnId;
      alternativeId = failed.branchId;
    } finally {
      generate = normal;
    }
    expect((await history(project.id, original.branchId)).branch.headTurnId).toBe(original.turnId);
    const retried = events((await repeat(project.id, alternativeId, failedTurnId, 'retry')).body).at(-1);
    expect(retried).toMatchObject({ type: 'chat.turn.completed', branchId: alternativeId });
    const updated = await history(project.id, alternativeId);
    expect(updated.turns).toHaveLength(1);
    expect(updated.turns[0]).toMatchObject({ retryOfTurnId: failedTurnId, parentTurnId: null });
    expect(create).toHaveBeenLastCalledWith(expect.objectContaining({
      messages: [
        { role: 'system', content: await narratorPrompt(project.id) },
        { role: 'user', content: 'Même saisie.' },
      ],
    }), expect.anything());
    const [failed] = await database.select().from(schema.chatTurns).where(eq(schema.chatTurns.id, failedTurnId));
    expect(failed.status).toBe('failed');
    const archived = await app.inject({
      method: 'GET', url: `/api/projects/${project.id}/turns/${failedTurnId}`, headers: { cookie },
    });
    expect(archived.statusCode).toBe(200);
    expect(archived.json()).toMatchObject({
      id: failedTurnId, status: 'failed', assistantMessage: null,
      userMessage: { content: 'Même saisie.' },
    });
    const rows = await database.select().from(schema.chatMessages)
      .where(eq(schema.chatMessages.projectId, project.id));
    expect(rows.filter((row) => row.role === 'user')).toHaveLength(1);
    expect((await repeat(project.id, original.branchId, original.turnId, 'retry')).statusCode).toBe(409);
  });

  it('rejects stale heads and cross-project branches before calling the provider', async () => {
    const first = await createProject('Sécurité des relations A');
    const second = await createProject('Sécurité des relations B');
    const completed = events((await send(first.id, 'Avance.')).body).at(-1);
    if (completed?.type !== 'chat.turn.completed') throw new Error('Missing completed turn.');
    const calls = create.mock.calls.length;
    const stale = await app.inject({
      method: 'POST', url: `/api/projects/${first.id}/branches/${first.defaultBranchId}/turns`,
      headers: { cookie }, payload: { content: 'Depuis un vieil onglet.', expectedHeadTurnId: null },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('CHAT_HEAD_CHANGED');
    const foreign = await app.inject({
      method: 'GET', url: `/api/projects/${second.id}/branches/${first.defaultBranchId}/history`, headers: { cookie },
    });
    expect(foreign.statusCode).toBe(404);
    const foreignWrite = await app.inject({
      method: 'POST', url: `/api/projects/${second.id}/branches/${first.defaultBranchId}/turns`,
      headers: { cookie }, payload: { content: 'Mauvais projet.', expectedHeadTurnId: completed.turnId },
    });
    expect(foreignWrite.statusCode).toBe(404);
    const foreignTurn = await app.inject({
      method: 'GET', url: `/api/projects/${second.id}/turns/${completed.turnId}`, headers: { cookie },
    });
    expect(foreignTurn.statusCode).toBe(404);
    expect(create.mock.calls.length).toBe(calls);
    await expect(database.update(schema.chatBranches).set({ headTurnId: completed.turnId })
      .where(eq(schema.chatBranches.projectId, second.id))).rejects.toThrow();
    expect((await history(second.id, second.defaultBranchId!)).turns).toEqual([]);
  });

  it('limits model context to recent whole turns while retaining the complete branch history', async () => {
    const project = await createProject('Contexte borné');
    if (!project.defaultBranchId) throw new Error('Missing default branch.');
    let parentTurnId: string | null = null;
    for (let index = 1; index <= 22; index++) {
      const userId = uuidv7();
      const assistantId = uuidv7();
      await database.insert(schema.chatMessages).values([
        { id: userId, projectId: project.id, role: 'user', content: `Question ${index}` },
        { id: assistantId, projectId: project.id, role: 'assistant', content: `Réponse ${index}` },
      ]);
      const turnId = uuidv7();
      await database.insert(schema.chatTurns).values({
        id: turnId, projectId: project.id, originBranchId: project.defaultBranchId,
        parentTurnId, userMessageId: userId, assistantMessageId: assistantId, status: 'completed',
      });
      parentTurnId = turnId;
    }
    await database.update(schema.chatBranches).set({ headTurnId: parentTurnId })
      .where(eq(schema.chatBranches.id, project.defaultBranchId));
    await send(project.id, 'Suite.');
    expect(create).toHaveBeenLastCalledWith(expect.objectContaining({
      messages: [
        { role: 'system', content: await narratorPrompt(project.id) },
        ...Array.from({ length: 20 }, (_, index) => [
          { role: 'user', content: `Question ${index + 3}` },
          { role: 'assistant', content: `Réponse ${index + 3}` },
        ]).flat(),
        { role: 'user', content: 'Suite.' },
      ],
    }), expect.anything());
    expect((await history(project.id, project.defaultBranchId)).turns).toHaveLength(23);
  });

  it('keeps individual turns inspectable and rejects corrupt context without publishing a provisional execution', async () => {
    const project = await createProject('Contexte incohérent');
    await send(project.id, 'Premier message.');
    await send(project.id, 'Deuxième message.');
    if (!project.defaultBranchId) throw new Error('Missing default branch.');
    const before = await history(project.id, project.defaultBranchId);
    const first = before.turns[0];
    const last = before.turns[1];
    const calls = create.mock.calls.length;
    await database.update(schema.chatTurns).set({ parentTurnId: last.id })
      .where(eq(schema.chatTurns.id, first.id));
    try {
      const detail = await app.inject({
        method: 'GET', url: `/api/projects/${project.id}/turns/${last.id}`, headers: { cookie },
      });
      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({ id: last.id, status: 'completed' });
      const response = await send(project.id, 'Ne pas publier ce tour.');
      expect(response.statusCode).toBe(500);
      expect(response.json().error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(create.mock.calls.length).toBe(calls);
    } finally {
      await database.update(schema.chatTurns).set({ parentTurnId: null })
        .where(eq(schema.chatTurns.id, first.id));
    }
    expect(await history(project.id, project.defaultBranchId)).toEqual(before);
    const messages = await database.select().from(schema.chatMessages)
      .where(eq(schema.chatMessages.projectId, project.id));
    expect(messages).toHaveLength(4);
  });

  it('delivers deltas before completion and rejects competing turns and mutations', async () => {
    const project = await createProject('Concurrence');
    const normal = generate;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    generate = async function* () {
      yield chunk('<resolution>Faits.</resolution><prose>Début');
      await gate;
      yield chunk(' de la réponse.</prose>');
      yield chunk('', 'stop');
    };
    try {
      const response = await fetch(`${address}/api/projects/${project.id}/branches/${project.defaultBranchId}/turns`, {
        method: 'POST', headers: { cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Commence.', expectedHeadTurnId: null }),
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

  async function memoryView(projectId: string, branchId: string) {
    const response = await app.inject({ method: 'GET', headers: { cookie },
      url: `/api/projects/${projectId}/branches/${branchId}/memories` });
    expect(response.statusCode).toBe(200);
    return memoryViewSchema.parse(response.json());
  }
  async function memoryChange(projectId: string, branchId: string, change: MemoryMutation['change']) {
    const view = await memoryView(projectId, branchId);
    const response = await app.inject({ method: 'POST', headers: { cookie },
      url: `/api/projects/${projectId}/branches/${branchId}/memories`,
      payload: { expectedHeadTurnId: view.headTurnId, expectedRevisionId: view.revisionId,
        expectedCatalogRevisionId: view.catalogRevisionId, change },
    });
    expect(response.statusCode, response.body).toBe(200);
    return memoryViewSchema.parse(response.json());
  }
  function propose(proposals: MemoryProposal[]) { guardianOutput = JSON.stringify({ v: 2, proposals }); }

  it('gives each pipeline agent its configured memory and retains access settings across version selections', async () => {
    const project = await createProject('M6 Accès');
    const branchId = project.defaultBranchId!;
    let view = await memoryChange(project.id, branchId, { op: 'saveTag',
      tag: { name: 'world_rules', description: 'Faits canoniques établis.' } });
    const truth = view.state.tags[0]!.id;
    view = await memoryChange(project.id, branchId, { op: 'saveTag',
      tag: { name: 'n_knowledge', description: 'Connaissances et croyances de N.' } });
    const belief = view.state.tags[1]!.id;
    await memoryChange(project.id, branchId, { op: 'saveEntry',
      entry: { tagIds: [truth], key: 'Max', content: 'Vérité réservée au narrateur', protected: true } });
    await memoryChange(project.id, branchId, { op: 'saveEntry',
      entry: { tagIds: [belief], key: 'Max', content: 'Croyance réservée à N', protected: false } });
    const team = await agents.listForProject(project.id);
    const narrator = team.find((agent) => agent.output === 'narrative')!;
    await memoryChange(project.id, branchId, { op: 'setAgentRead', agentId: narrator.agentId,
      read: { mode: 'selected', tagIds: [truth] } });
    const analyst = await agents.create({ phase: 'analysis', output: 'envelope', name: 'Chaos', instructions: 'Mission spécifique de N.' });
    const updated = await agents.configure(project.id, { agents: [
      ...team.map(({ agentId, versionId }) => ({ agentId, versionId })),
      { agentId: analyst.id, versionId: analyst.versions[0]!.id },
    ] });
    expect(updated.find((agent) => agent.agentId === narrator.agentId)?.memoryRead?.tagIds).toEqual([truth]);
    expect(updated.find((agent) => agent.agentId === analyst.id)?.memoryRead).toEqual({ mode: 'selected', tagIds: [] });
    await memoryChange(project.id, branchId, { op: 'setAgentRead', agentId: analyst.id,
      read: { mode: 'selected', tagIds: [belief] } });
    await memoryChange(project.id, branchId, { op: 'settings', enabled: true });
    const start = create.mock.calls.length;
    try {
      propose([]);
      await send(project.id, 'Une scène.');
      const calls = create.mock.calls.slice(start).map(([params]) => params);
      const analysis = calls.find((params) => typeof params.messages[0]?.content === 'string'
        && params.messages[0].content.includes('Mission spécifique de N.'))!;
      expect(analysis.messages[0]!.content).toContain('Croyance réservée à N');
      expect(analysis.messages[0]!.content).not.toContain('Vérité réservée au narrateur');
      const narration = calls.find((params) => params.stream)!;
      expect(narration.messages[0]!.content).toContain('Vérité réservée au narrateur');
      expect(narration.messages[0]!.content).not.toContain('Croyance réservée à N');
      const guardian = calls.find((params) => typeof params.messages[0]?.content === 'string'
        && params.messages[0].content.includes('Maintain memory from'))!;
      expect(guardian.messages[0]!.content).not.toContain('Mission spécifique de N.');
      expect(guardian.messages[1]!.content).toContain('Connaissances et croyances de N.');
      expect(guardian.messages[1]!.content).toContain('Croyance réservée à N');
      expect(guardian.messages).toHaveLength(2);
      expect(guardian.messages[1]!.content).toContain('Return JSON only');
      const turn = (await history(project.id, branchId)).turns.at(-1)!;
      const persisted = await database.select().from(schema.llmCall).where(eq(schema.llmCall.turnId, turn.id));
      const analysisTrace = persisted.find((call) => call.stage === 'analysis')!;
      await memoryChange(project.id, branchId, { op: 'setAgentRead', agentId: analyst.id,
        read: { mode: 'all', tagIds: [] } });
      const detail = await app.inject({ method: 'GET', headers: { cookie },
        url: `/api/projects/${project.id}/turns/${turn.id}/traces/${analysisTrace.id}` });
      expect(detail.statusCode).toBe(200);
      expect(traceCallDetailSchema.parse(detail.json()).request.memory?.entries.map((entry) => entry.content))
        .toEqual(['Croyance réservée à N']);
      await agents.configure(project.id, { agents: team.map(({ agentId, versionId }) => ({ agentId, versionId })) });
      expect((await memoryView(project.id, branchId)).state.entries).toHaveLength(2);
      await agents.remove(analyst.id);
    } finally { guardianOutput = null; }
  });

  it('generates setup as a reviewable draft and changes routing only after explicit approval', async () => {
    const project = await createProject('M6 Configuration proposée');
    const branchId = project.defaultBranchId!;
    const originalTeam = await agents.listForProject(project.id);
    const analyst = await agents.create({ phase: 'analysis', output: 'envelope',
      name: 'Cohérence', instructions: 'Mission réservée au seul appel de configuration.' });
    const team = await agents.configure(project.id, { agents: [
      ...originalTeam.map(({ agentId, versionId }) => ({ agentId, versionId })),
      { agentId: analyst.id, versionId: analyst.versions[0]!.id },
    ] });
    const before = await memoryView(project.id, branchId);
    try {
      setupOutput = JSON.stringify({
        tags: [{ ref: 'world', name: 'world_rules', description: 'Vérités établies du monde.' }],
        agents: team.map((agent) => ({ agentId: agent.agentId,
          mode: agent.output === 'envelope' ? 'selected' : 'all', tagRefs: agent.output === 'envelope' ? ['world'] : [] })),
      });
      const response = await app.inject({ method: 'POST', headers: { cookie },
        url: `/api/projects/${project.id}/branches/${branchId}/memories/setup`,
        payload: { expectedHeadTurnId: before.headTurnId, expectedRevisionId: before.revisionId,
          expectedCatalogRevisionId: before.catalogRevisionId } });
      expect(response.statusCode, response.body).toBe(200);
      expect(await memoryView(project.id, branchId)).toEqual(before);
      expect((await agents.listForProject(project.id)).find((agent) => agent.agentId === analyst.id)?.memoryRead?.tagIds).toEqual([]);
      await memoryChange(project.id, branchId, { op: 'applySetup', proposal: response.json() });
      const result = await memoryView(project.id, branchId);
      expect(result.state.tags[0]!.name).toBe('world_rules');
      expect(result.state.entries).toEqual([]);
      expect((await agents.listForProject(project.id)).find((agent) => agent.agentId === analyst.id)?.memoryRead)
        .toEqual({ mode: 'selected', tagIds: [result.state.tags[0]!.id] });
    } finally {
      setupOutput = null;
      await agents.configure(project.id, { agents: originalTeam.map(({ agentId, versionId }) => ({ agentId, versionId })) });
      await agents.remove(analyst.id);
    }
  });

  it('does not activate suggested tags or change subscriptions during a normal turn', async () => {
    const project = await createProject('M6 Suggestion de tag');
    const branchId = project.defaultBranchId!;
    const before = await memoryChange(project.id, branchId, { op: 'saveTag',
      tag: { name: 'world_rules', description: 'Vérités établies.' } });
    await memoryChange(project.id, branchId, { op: 'settings', enabled: true });
    const team = await agents.listForProject(project.id);
    try {
      guardianOutput = JSON.stringify({ v: 2, proposals: [], tagSuggestions: [
        { name: 'n_knowledge', description: 'Connaissances de N.', reason: 'N entre en scène.' },
      ] });
      await send(project.id, 'N apparaît.');
      expect((await memoryView(project.id, branchId)).state.tags).toEqual(before.state.tags);
      expect(await agents.listForProject(project.id)).toEqual(team);
      expect((await history(project.id, branchId)).turns.at(-1)!.memory?.tagSuggestions?.[0]?.name).toBe('n_knowledge');
    } finally { guardianOutput = null; }
  });

  it('rolls back entry writes at the SQL savepoint without losing the narration', async () => {
    const project = await createProject('M6 Savepoint');
    const branchId = project.defaultBranchId!;
    const before = await memoryChange(project.id, branchId, { op: 'saveTag',
      tag: { name: 'Savoir', description: 'Informations établies.' } });
    await memoryChange(project.id, branchId, { op: 'settings', enabled: true });
    await pool.query(`CREATE FUNCTION choral_writer.m6_test_reject_bank() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.project_id = '${project.id}'::uuid THEN RAISE EXCEPTION 'simulated memory write failure'; END IF;
        RETURN NEW;
      END $$`);
    await pool.query(`CREATE TRIGGER m6_test_reject_bank BEFORE INSERT OR UPDATE ON choral_writer.memory_bank
      FOR EACH ROW EXECUTE FUNCTION choral_writer.m6_test_reject_bank()`);
    try {
      propose([
        { op: 'create', tagIds: [before.state.tags[0]!.id], key: 'Porte', content: 'Une porte', reason: 'Scène' },
      ]);
      const last = events((await send(project.id, 'Une scène complète.')).body).at(-1)!;
      expect(last.type).toBe('chat.turn.completed');
      const after = await memoryView(project.id, branchId);
      expect(after.state.tags).toEqual(before.state.tags);
      expect(after.state.entries).toEqual([]);
      expect((await history(project.id, branchId)).turns.at(-1)!.memory?.status).toBe('failed');
    } finally {
      guardianOutput = null;
      await pool.query('DROP TRIGGER m6_test_reject_bank ON choral_writer.memory_bank');
      await pool.query('DROP FUNCTION choral_writer.m6_test_reject_bank()');
    }
  });

  it('retains a fact from turn three in turn twenty-five after the conversation window has moved past it', async () => {
    const project = await createProject('M6 Long récit');
    const branchId = project.defaultBranchId!;
    const view = await memoryChange(project.id, branchId, { op: 'saveTag',
      tag: { name: 'Faits durables', description: 'Faits à conserver.' } });
    await memoryChange(project.id, branchId, { op: 'settings', enabled: true });
    try {
      for (let turn = 1; turn <= 25; turn++) {
        propose(turn === 3 ? [{ op: 'create', tagIds: [view.state.tags[0]!.id],
          key: 'Secret', content: 'Le secret durable du tour trois.', reason: 'Révélation au tour 3' }] : []);
        const response = events((await send(project.id, turn === 3 ? 'Révélation unique au tour trois.' : `Scène ${turn}.`)).body);
        expect(response.at(-1)?.type).toBe('chat.turn.completed');
      }
      const last = create.mock.calls.filter(([params]) => params.stream).at(-1)![0];
      expect(last.messages).toHaveLength(42); // System, twenty complete turns and the current user input.
      expect(last.messages[0]!.content).toContain('Le secret durable du tour trois.');
      expect(last.messages.slice(1).some((message) => message.content === 'Révélation unique au tour trois.')).toBe(false);
    } finally { guardianOutput = null; }
  });

  it('rolls back the candidate and its success record when cancelled at the end of memory processing', async () => {
    const project = await createProject('M6 Annulation mémoire');
    const branchId = project.defaultBranchId!;
    const view = await memoryChange(project.id, branchId, { op: 'saveTag',
      tag: { name: 'Faits', description: 'Informations établies.' } });
    await memoryChange(project.id, branchId, { op: 'settings', enabled: true });
    const controller = new AbortController();
    try {
      propose([{ op: 'create', tagIds: [view.state.tags[0]!.id], key: 'Mara',
        content: 'Souvenir à annuler', reason: 'Scène' }]);
      const result = await chat.run({ operation: 'send', projectId: project.id, branchId,
        expectedHeadTurnId: null, content: 'Narration conservée.' }, async (event) => {
        if (event.type === 'chat.pipeline.stage' && event.stage === 'reducer' && event.status === 'completed') {
          controller.abort(new DOMException('Client disconnected.', 'AbortError'));
        }
      }, controller.signal);
      expect(result.status).toBe('completed');
      expect((await memoryView(project.id, branchId)).state.entries).toEqual([]);
      const runs = await memories.trace(project.id, result.turnId);
      expect(runs.runs.map((run) => run.result.status)).toEqual(['failed']);
    } finally { guardianOutput = null; }
  });

  it('preserves memory after whitespace-only Guardian output and repairs it without replaying the story', async () => {
    const project = await createProject('M6 Guardian vide');
    const branchId = project.defaultBranchId!;
    const initial = await memoryChange(project.id, branchId, { op: 'saveTag',
      tag: { name: 'Faits', description: 'Faits établis' } });
    await memoryChange(project.id, branchId, { op: 'saveEntry',
      entry: { tagIds: [initial.state.tags[0]!.id], key: 'Max', content: 'Mémoire intacte', protected: false } });
    await memoryChange(project.id, branchId, { op: 'settings', enabled: true });
    const before = await memoryView(project.id, branchId);
    try {
      guardianOutput = ' \n '.repeat(100);
      await send(project.id, 'La scène continue.');
      const turn = (await history(project.id, branchId)).turns.at(-1)!;
      expect(turn.status).toBe('completed');
      expect(turn.memory).toMatchObject({ status: 'failed', code: 'LLM_EMPTY_RESPONSE',
        message: 'Le fournisseur LLM a renvoyé une réponse vide.' });
      const failedView = await memoryView(project.id, branchId);
      expect(failedView.state).toEqual(before.state);
      const streamCount = create.mock.calls.filter(([params]) => params.stream).length;
      propose([]);
      const repair = await app.inject({ method: 'POST', headers: { cookie },
        url: `/api/projects/${project.id}/branches/${branchId}/turns/${turn.id}/memory/retry`,
        payload: { expectedHeadTurnId: turn.id, expectedRevisionId: failedView.revisionId,
          expectedCatalogRevisionId: failedView.catalogRevisionId } });
      expect(repair.statusCode, repair.body).toBe(200);
      expect(repair.json().status).toBe('success');
      expect(create.mock.calls.filter(([params]) => params.stream)).toHaveLength(streamCount);
      const repaired = (await history(project.id, branchId)).turns.at(-1)!;
      expect(repaired.assistantMessage).toEqual(turn.assistantMessage);
      expect(repaired.memory?.status).toBe('success');
      expect((await memories.trace(project.id, turn.id)).runs.map((run) => run.result.status)).toEqual(['failed', 'success']);
    } finally { guardianOutput = null; }
  });

  it('isolates regenerated memory, honors manual corrections and does not replay the narrator during memory repair', async () => {
    const project = await createProject('M6 Branches');
    const branchId = project.defaultBranchId!;
    let view = await memoryChange(project.id, branchId, { op: 'saveTag',
      tag: { name: 'Faits', description: 'Faits établis' } });
    const tagId = view.state.tags[0]!.id;
    await memoryChange(project.id, branchId, { op: 'saveEntry',
      entry: { tagIds: [tagId], key: 'Max', content: 'État initial A', protected: false } });
    await memoryChange(project.id, branchId, { op: 'settings', enabled: true });
    view = await memoryView(project.id, branchId);
    const entryId = view.state.entries[0]!.id;
    try {
      propose([{ op: 'edit', entryId, content: 'État B', reason: 'Première scène' }]);
      expect(events((await send(project.id, 'Première scène.')).body).at(-1)?.type).toBe('chat.turn.completed');
      const first = (await history(project.id, branchId)).turns.at(-1)!;
      expect(first.memory?.status).toBe('success');
      await memoryChange(project.id, branchId, { op: 'saveEntry', id: entryId,
        entry: { tagIds: [tagId], key: 'Max', content: 'B corrigé manuellement', protected: false } });
      propose([{ op: 'edit', entryId, content: 'B alternatif depuis A', reason: 'Autre première scène' }]);
      const firstAlternative = events((await repeat(project.id, branchId, first.id, 'regenerate')).body).at(-1)!;
      if (firstAlternative.type !== 'chat.turn.completed') throw new Error('Missing first alternative.');
      const firstTrace = await memories.trace(project.id, firstAlternative.turnId);
      expect(firstTrace.input?.entries[0]!.content).toBe('État initial A');
      propose([]);
      await send(project.id, 'Deuxième scène.');
      const prompt = create.mock.calls.filter(([params]) => params.stream).at(-1)![0].messages[0]!.content;
      expect(prompt).toContain('B corrigé manuellement');
      const second = (await history(project.id, branchId)).turns.at(-1)!;
      propose([{ op: 'edit', entryId, content: 'État C alternatif', reason: 'Scène alternative' }]);
      const alternative = events((await repeat(project.id, branchId, second.id, 'regenerate')).body).at(-1)!;
      expect(alternative.type).toBe('chat.turn.completed');
      if (alternative.type !== 'chat.turn.completed') throw new Error('Missing completed alternative.');
      expect((await memoryView(project.id, alternative.branchId)).state.entries[0]!.content).toBe('État C alternatif');
      expect((await memoryView(project.id, branchId)).state.entries[0]!.content).toBe('B corrigé manuellement');
      const trace = memoryTraceSchema.parse((await app.inject({ method: 'GET', headers: { cookie },
        url: `/api/projects/${project.id}/turns/${alternative.turnId}/memory` })).json());
      expect(trace.input?.entries[0]!.content).toBe('B corrigé manuellement');
      view = await memoryView(project.id, branchId);
      propose([{ op: 'edit', entryId, content: 'Réparation manuelle assistée', reason: 'Correction complémentaire' }]);
      const streamCount = create.mock.calls.filter(([params]) => params.stream).length;
      await database.insert(schema.llmCall).values({
        id: uuidv7(), turnId: second.id, stage: 'analysis', model: 'legacy-model',
        request: { messages: [] }, response: 'Legacy analysis without a JSON envelope',
        durationMs: 0, status: 'success',
      });
      const repair = await app.inject({ method: 'POST', headers: { cookie },
        url: `/api/projects/${project.id}/branches/${branchId}/turns/${second.id}/memory/retry`,
        payload: { expectedHeadTurnId: second.id, expectedRevisionId: view.revisionId,
          expectedCatalogRevisionId: view.catalogRevisionId } });
      expect(repair.statusCode, repair.body).toBe(200);
      expect(repair.json().status).toBe('success');
      expect(create.mock.calls.filter(([params]) => params.stream)).toHaveLength(streamCount);
      expect((await history(project.id, branchId)).turns.at(-1)!.assistantMessage?.content).toBe(second.assistantMessage?.content);
      expect((await memoryView(project.id, branchId)).state.entries[0]!.content).toBe('Réparation manuelle assistée');
      const oldRetry = await app.inject({ method: 'POST', headers: { cookie },
        url: `/api/projects/${project.id}/branches/${branchId}/turns/${first.id}/memory/retry`,
        payload: { expectedHeadTurnId: second.id, expectedRevisionId: view.revisionId,
          expectedCatalogRevisionId: view.catalogRevisionId } });
      expect(oldRetry.statusCode).toBe(409);
    } finally { guardianOutput = null; }
  });

  it('keeps narration and the entire previous bank after a forbidden batch, then permits the next turn', async () => {
    const project = await createProject('M6 Atomicité');
    const branchId = project.defaultBranchId!;
    const initial = await memoryChange(project.id, branchId, { op: 'saveTag',
      tag: { name: 'Faits', description: 'Informations établies.' } });
    const tagId = initial.state.tags[0]!.id;
    await memoryChange(project.id, branchId, { op: 'settings', enabled: true });
    const before = await memoryView(project.id, branchId);
    try {
      propose([
        { op: 'create', tagIds: [tagId], key: 'Mara', content: 'Nouvelle entrée', reason: 'Scène' },
        { op: 'create', tagIds: [uuidv7()], key: 'Interdit', content: 'Non', reason: 'Test' },
      ]);
      const response = events((await send(project.id, 'Scène valide, mémoire invalide.')).body);
      expect(response.at(-1)?.type).toBe('chat.turn.completed');
      const current = await memoryView(project.id, branchId);
      expect(current.state.entries).toEqual(before.state.entries);
      expect(current.revisionId).toBe(before.revisionId);
      expect((await history(project.id, branchId)).turns.at(-1)!.memory?.status).toBe('failed');
      guardianOutput = '{"v":2,"proposals":"invalid"}';
      const count = create.mock.calls.length;
      await send(project.id, 'On continue.');
      expect(create.mock.calls.length - count).toBe(3); // Narrator and two schema attempts.
      expect((await history(project.id, branchId)).turns.at(-1)).toMatchObject({
        status: 'completed', memory: { status: 'failed', code: 'LLM_INVALID_RESPONSE' },
      });
      propose([]);
      await send(project.id, 'La suite.');
      expect((await history(project.id, branchId)).turns.at(-1)!.memory?.status).toBe('success');
    } finally { guardianOutput = null; }
  });

  it('enforces head/catalog revisions and explicit legacy reset without leaking memory across projects', async () => {
    const project = await createProject('M6 Conflits');
    const branchId = project.defaultBranchId!;
    const initial = await memoryView(project.id, branchId);
    await memoryChange(project.id, branchId, { op: 'saveTag', tag: { name: 'Faits', description: 'Informations établies.' } });
    const conflict = await app.inject({ method: 'POST', headers: { cookie },
      url: `/api/projects/${project.id}/branches/${branchId}/memories`,
      payload: { expectedHeadTurnId: null, expectedRevisionId: initial.revisionId,
        expectedCatalogRevisionId: initial.catalogRevisionId, change: { op: 'settings', enabled: true } } });
    expect(conflict.statusCode).toBe(409);
    await send(project.id, 'Ancienne scène.');
    const turn = (await history(project.id, branchId)).turns.at(-1)!;
    await database.update(schema.chatTurns).set({ memorySnapshot: null }).where(eq(schema.chatTurns.id, turn.id));
    const scoped = await memoryView(project.id, branchId);
    await memoryChange(project.id, branchId, { op: 'saveEntry',
      entry: { tagIds: [scoped.state.tags[0]!.id], key: 'Nouveau', content: 'Ajout après ancien tour', protected: false } });
    const rejected = await repeat(project.id, branchId, turn.id, 'regenerate');
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json().error.code).toBe('MEMORY_LEGACY_RESET');
    const accepted = await app.inject({ method: 'POST', headers: { cookie },
      url: `/api/projects/${project.id}/branches/${branchId}/turns/${turn.id}/regenerate`,
      payload: { expectedHeadTurnId: turn.id, allowLegacyMemoryReset: true } });
    const final = events(accepted.body).at(-1)!;
    if (final.type !== 'chat.turn.completed') throw new Error('Missing completed legacy alternative.');
    expect((await memoryView(project.id, final.branchId)).state.entries).toEqual([]);
    expect((await memoryView(project.id, branchId)).state.entries).toHaveLength(1);
    const other = await createProject('M6 Autre projet');
    expect((await app.inject({ method: 'GET', headers: { cookie },
      url: `/api/projects/${other.id}/branches/${branchId}/memories` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', headers: { cookie },
      url: `/api/projects/${other.id}/turns/${turn.id}/memory` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET',
      url: `/api/projects/${project.id}/branches/${branchId}/memories` })).statusCode).toBe(401);
  });

  it('aborts generation when the client disconnects and persists the failed turn', async () => {
    const project = await createProject('Déconnexion');
    const normal = generate;
    const controller = new AbortController();
    generate = async function* (signal) {
      yield chunk('<resolution>Faits.</resolution><prose>Début de réponse');
      if (!signal) throw new Error('Missing LLM abort signal.');
      await new Promise<void>((resolve) => {
        signal.addEventListener('abort', () => resolve(), { once: true });
        if (signal.aborted) resolve();
      });
      signal.throwIfAborted();
    };
    try {
      const response = await fetch(`${address}/api/projects/${project.id}/branches/${project.defaultBranchId}/turns`, {
        method: 'POST', headers: { cookie, 'Content-Type': 'application/json' },
        signal: controller.signal, body: JSON.stringify({ content: 'Bonjour.', expectedHeadTurnId: null }),
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
        const [turn] = await database.select().from(schema.chatTurns).where(eq(schema.chatTurns.projectId, project.id));
        expect(turn?.status).toBe('failed');
      });
      const history = await database.select().from(schema.chatMessages).where(eq(schema.chatMessages.projectId, project.id));
      expect(history.map((message) => message.role)).toEqual(['user']);
    } finally {
      controller.abort();
      generate = normal;
    }
  });
});
