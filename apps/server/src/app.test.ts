import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { buildApp } from './app.js';
import { budgetHooks } from './budget.js';
import { withProjectExecutionLock } from './locks.js';
import { agents, branches, budgetReservations, events, llmCalls, memoryProjections, projects, proposals, summaries, turns, whiteboardEntries } from './schema.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('API with PostgreSQL', () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);
  let app: Awaited<ReturnType<typeof buildApp>>;
  let projectId: string | undefined;
  let budgetProjectId: string | undefined;
  let guardianFails = false;

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'drizzle' });
    app = await buildApp(db, {
      password: 'a-test-password', cookieSecret: 'test-secret-with-at-least-32-characters',
      llmApiKey: 'test-key', llmBaseUrl: 'https://example.test/v1', llmModel: 'test-model', secureCookies: false,
      staticRoot: fileURLToPath(new URL('../../web/dist/', import.meta.url))
    }, async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as { stream?: boolean; messages: { content: string }[] };
      const prompt = request.messages[0].content;
      if (request.stream) {
        const narration = '<resolution>{"happened":[{"text":"Marie parle","participants":["marie"]}],"time":{"label":"soir","elapsed_days":1}}</resolution><prose>Marie parle doucement.</prose>';
        const frames = [narration.slice(0, 40), narration.slice(40, 100), narration.slice(100)]
          .map(content => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`).join('') + 'data: [DONE]\n\n';
        return new Response(frames, { status: 200 });
      }
      if (prompt.includes('Propose uniquement les mutations') && guardianFails) return new Response('', { status: 400 });
      const content = prompt.includes('ANALYSIS_TEST')
        ? JSON.stringify({ analysis: 'Marie hésite', constraints: ['Marie refuse de donner la clé'], notes: [], remember: [] })
        : prompt.includes('Propose uniquement les mutations')
        ? JSON.stringify({ proposals: [{ op: 'add_fact', text: 'Marie parle', subjects: ['marie'], tags: [], importance: 'LOW', public: true, known_by: [], source_quote: 'Marie parle' }] })
        : prompt.includes('"controlled"')
          ? JSON.stringify({ controlled: [{ character: 'marie', action: 'parle' }], intentions: [], entities: ['marie'], time_scale: 'moment', meta_direction: null })
          : 'Réponse simulée';
      return new Response(JSON.stringify({
        choices: [{ message: { content } }], usage: { prompt_tokens: 8, completion_tokens: 4 }
      }), { status: 200 });
    });
  });

  afterAll(async () => {
    if (app) await app.close();
    if (budgetProjectId) {
      await db.delete(budgetReservations).where(eq(budgetReservations.projectId, budgetProjectId));
      await db.delete(llmCalls).where(eq(llmCalls.projectId, budgetProjectId));
      await db.delete(turns).where(eq(turns.projectId, budgetProjectId));
      await db.delete(agents).where(eq(agents.projectId, budgetProjectId));
      await db.delete(memoryProjections).where(eq(memoryProjections.projectId, budgetProjectId));
      await db.delete(branches).where(eq(branches.projectId, budgetProjectId));
      await db.delete(projects).where(eq(projects.id, budgetProjectId));
    }
    if (projectId) {
      const turnRows = await db.select({ id: turns.id }).from(turns).where(eq(turns.projectId, projectId));
      for (const turn of turnRows) await db.delete(whiteboardEntries).where(eq(whiteboardEntries.turnId, turn.id));
      await db.delete(llmCalls).where(eq(llmCalls.projectId, projectId));
      await db.delete(proposals).where(eq(proposals.projectId, projectId));
      await db.delete(summaries).where(eq(summaries.projectId, projectId));
      await db.delete(events).where(eq(events.projectId, projectId));
      await db.delete(turns).where(eq(turns.projectId, projectId));
      await db.delete(agents).where(eq(agents.projectId, projectId));
      await db.delete(memoryProjections).where(eq(memoryProjections.projectId, projectId));
      await db.delete(branches).where(eq(branches.projectId, projectId));
      await db.delete(projects).where(eq(projects.id, projectId));
    }
    await pool.end();
  });

  it('requires authentication and persists a traced LLM call', async () => {
    const index = await app.inject({ method: 'GET', url: '/' });
    expect(index.statusCode).toBe(200);
    expect(index.body).toContain('<title>Choral Writer</title>');
    expect((await app.inject({ method: 'GET', url: '/api/projects' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/login', payload: { password: 'incorrect' } })).statusCode).toBe(401);
    const login = await app.inject({ method: 'POST', url: '/api/login', payload: { password: 'a-test-password' } });
    expect(login.statusCode).toBe(200);
    const cookie = login.headers['set-cookie'];
    expect(cookie).toBeDefined();
    const headers = { cookie: Array.isArray(cookie) ? cookie[0] : cookie! };

    const budgetProject = await app.inject({
      method: 'POST', url: '/api/projects', headers,
      payload: { name: 'Budget', settings: { budget: { project_usd: 0.00056,
        prices: { 'test-model': { input_per_million: 1, output_per_million: 1 } } } } }
    });
    budgetProjectId = budgetProject.json().id;
    const budgetCalls = await Promise.all([0, 1].map(() => app.inject({
      method: 'POST', url: `/api/projects/${budgetProjectId}/llm-test`, headers, payload: { prompt: 'Bonjour' }
    })));
    expect(budgetCalls.map(item => item.statusCode).sort()).toEqual([200, 409]);
    const budgetTraces = await db.select().from(llmCalls).where(eq(llmCalls.projectId, budgetProjectId!));
    expect(budgetTraces).toHaveLength(1);
    expect(Number(budgetTraces[0].accountedCostUsd)).toBeCloseTo(0.000559);
    expect(await db.select().from(budgetReservations).where(eq(budgetReservations.projectId, budgetProjectId!))).toHaveLength(0);
    const expandedBudget = await app.inject({ method: 'PUT', url: `/api/projects/${budgetProjectId}/settings`, headers,
      payload: { budget: { project_usd: 0.0012, prices: { 'test-model': { input_per_million: 1, output_per_million: 1 } } } } });
    expect(expandedBudget.statusCode).toBe(200);
    const reserve = budgetHooks(db).reserve;
    const reserveOptions = { projectId: budgetProjectId!, model: 'test-model',
      messages: [{ role: 'user' as const, content: 'Bonjour' }], maxTokens: 512 };
    const attempts = await Promise.allSettled([reserve(reserveOptions), reserve(reserveOptions)]);
    expect(attempts.map(attempt => attempt.status).sort()).toEqual(['fulfilled', 'rejected']);
    const reservationId = attempts.find(attempt => attempt.status === 'fulfilled')!.value!;
    const reservationsUrl = `/api/projects/${budgetProjectId}/budget-reservations`;
    const settlementUrl = `${reservationsUrl}/${reservationId}/settle`;
    const reservations = await app.inject({ method: 'GET', url: reservationsUrl, headers });
    expect(reservations.json()).toMatchObject([{ id: reservationId, settled: false }]);
    expect((await app.inject({ method: 'POST', url: settlementUrl, headers, payload: { costUsd: -1 } })).statusCode).toBe(400);
    await withProjectExecutionLock(pool, budgetProjectId!, async () => {
      expect((await app.inject({ method: 'POST', url: settlementUrl, headers, payload: { costUsd: 0.0002 } })).statusCode).toBe(409);
    });
    expect((await app.inject({ method: 'POST', url: settlementUrl, headers, payload: { costUsd: 0.0002 } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: settlementUrl, headers, payload: { costUsd: 0 } })).statusCode).toBe(404);
    const settled = (await app.inject({ method: 'GET', url: reservationsUrl, headers })).json()[0];
    expect(Number(settled.amount)).toBeCloseTo(0.000559);
    expect(Number(settled.settledAmount)).toBeCloseTo(0.0002);
    expect(settled.settled).toBe(true);
    await expect(reserve(reserveOptions)).rejects.toThrow('Project budget would be exceeded');
    const newBudget = await app.inject({ method: 'PUT', url: `/api/projects/${budgetProjectId}/settings`, headers,
      payload: { budget: { turn_usd: 0.000001, prices: { 'test-model': { input_per_million: 1, output_per_million: 1 } } } } });
    expect(newBudget.statusCode).toBe(200);
    const costlyTurn = await app.inject({ method: 'POST', url: `/api/projects/${budgetProjectId}/turns`, headers,
      payload: { userInput: 'Bonjour' } });
    expect(costlyTurn.body).toContain('Turn budget would be exceeded');
    expect(await db.select().from(llmCalls).where(eq(llmCalls.projectId, budgetProjectId!))).toHaveLength(1);

    const created = await app.inject({
      method: 'POST', url: '/api/projects', headers,
      payload: { name: `Integration ${randomUUID()}`, worldMd: '# Monde' }
    });
    expect(created.statusCode).toBe(201);
    projectId = created.json().id;
    const call = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/llm-test`, headers, payload: { prompt: 'Bonjour' }
    });
    expect(call.statusCode).toBe(200);
    expect(call.json()).toEqual({ response: 'Réponse simulée' });
    const traces = await db.select().from(llmCalls).where(eq(llmCalls.projectId, projectId!));
    expect(traces).toMatchObject([{
      purpose: 'test', model: 'test-model', status: 'succeeded',
      response: 'Réponse simulée', inputTokens: 8, outputTokens: 4,
      messages: [{ role: 'user', content: 'Bonjour' }]
    }]);
    expect((await app.inject({ method: 'POST', url: `/api/projects/${projectId}/turns`, headers,
      payload: { userInput: 'Trop tôt' } })).statusCode).toBe(409);
    expect((await app.inject({ method: 'POST', url: `/api/projects/${projectId}/seed/apply`, headers,
      payload: { proposals: [] } })).json().initialized).toBe(true);

    const seed = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/debug/proposals`, headers,
      payload: { proposals: [
        { op: 'create_entity', key: 'marie', name: 'Marie', kind: 'person', source_quote: 'manuel' },
        { op: 'create_entity', key: 'leon', name: 'Léon', kind: 'person', source_quote: 'manuel' },
        { op: 'create_entity', key: 'porte', name: 'Porte', kind: 'object', source_quote: 'manuel' },
        { op: 'add_fact', text: 'Léon a tué le baron', subjects: ['leon'], tags: [], importance: 'HIGH', public: false, known_by: ['leon'], source_quote: 'manuel' },
        { op: 'set_knowledge', character: 'marie', fact_ref: 'F1', content: 'Hugo a tué le baron', status: 'believes', is_false: true, source_quote: 'manuel' },
        { op: 'add_fact', text: 'Marie a perdu sa main gauche', subjects: ['marie'], tags: [], importance: 'HIGH',
          public: true, known_by: [], source_quote: 'manuel' },
        { op: 'add_fact', text: 'La porte est verrouillée et personne ne possède la clé', subjects: ['porte'], tags: [],
          importance: 'HIGH', public: true, known_by: [], source_quote: 'manuel' }
      ] } });
    expect(seed.json().results.every((result: { status: string }) => result.status === 'accepted')).toBe(true);
    await db.insert(agents).values({ projectId: projectId!, key: 'marie', name: 'Marie', kind: 'analysis',
      systemPrompt: 'ANALYSIS_TEST', model: 'test-model', params: {},
      contextSpec: { facts: { about: 'all', importance_min: 1 }, knowledge_of: ['marie'], events: { last: 8 }, recent_prose: 1 },
      schedule: { mode: 'always' }, required: true });
    const first = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/turns`, headers,
      payload: { userInput: 'Marie parle' } });
    expect(first.body).toContain('event: prose');
    expect(first.body).toContain('event: committed');
    const story = (await app.inject({ method: 'GET', url: `/api/projects/${projectId}/turns`, headers })).json();
    expect(story[0].status).toBe('committed');
    expect(story[0].prose).toBe('Marie parle doucement.');
    const memory = (await app.inject({ method: 'GET', url: `/api/projects/${projectId}/memory`, headers })).json();
    expect(memory.state.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: 'Léon a tué le baron' }),
      expect.objectContaining({ text: 'Marie parle', status: 'active' })
    ]));
    const debug = (await app.inject({ method: 'GET', url: `/api/turns/${story[0].id}/debug`, headers })).json();
    expect(debug.whiteboard[0].status).toBe('succeeded');
    const analysis = debug.calls.find((call: { purpose: string }) => call.purpose === 'analysis');
    expect(analysis.messages[0].content).toContain('Hugo a tué le baron');
    expect(analysis.messages[0].content).not.toContain('Léon a tué le baron');
    const narratorCall = debug.calls.find((call: { purpose: string }) => call.purpose === 'narrator');
    expect(narratorCall.messages[0].content).toContain('Marie refuse de donner la clé');

    guardianFails = true;
    const second = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/turns`, headers,
      payload: { userInput: 'Marie parle encore' } });
    expect(second.body).toContain('"retryGuardian":true');
    const stalled = (await app.inject({ method: 'GET', url: `/api/projects/${projectId}/turns`, headers })).json()[1];
    expect(stalled.status).toBe('narrated');
    const secondDebug = (await app.inject({ method: 'GET', url: `/api/turns/${stalled.id}/debug`, headers })).json();
    const secondAnalysis = secondDebug.calls.find((call: { purpose: string }) => call.purpose === 'analysis');
    expect(secondAnalysis.messages[0].content).toContain('Événements:');
    expect(secondAnalysis.messages[0].content).toContain('Prose récente:');
    expect(secondAnalysis.messages[0].content).toContain('Marie parle');
    expect(secondAnalysis.messages[0].content).not.toContain('Léon a tué le baron');
    const blocked = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/turns`, headers,
      payload: { userInput: 'Suite' } });
    expect(blocked.statusCode).toBe(409);
    guardianFails = false;
    const retried = await app.inject({ method: 'POST', url: `/api/turns/${stalled.id}/retry-guardian`, headers });
    expect(retried.statusCode).toBe(200);
    expect(retried.json().messages.at(-1).value.proposals[0].rejectCode).toBe('DUPLICATE_FACT');
    const fork = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/rewind`, headers,
      payload: { turnId: story[0].id } });
    expect(fork.statusCode).toBe(200);
    const forkTurns = (await app.inject({ method: 'GET', url: `/api/projects/${projectId}/turns`, headers })).json();
    expect(forkTurns).toHaveLength(1);
    const forkMemory = (await app.inject({ method: 'GET', url: `/api/projects/${projectId}/memory`, headers })).json();
    expect(forkMemory.state).toEqual(memory.state);
    const originalBranch = created.json().activeBranchId;
    expect((await app.inject({ method: 'POST', url: `/api/projects/${projectId}/branches/${originalBranch}/activate`, headers })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/api/projects/${projectId}/turns`, headers })).json()).toHaveLength(2);
    for (let index = 0; index < 3; index++) {
      const next = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/turns`, headers,
        payload: { userInput: `Suite ${index}` } });
      expect(next.body).toContain('event: committed');
    }
    const compacted = (await app.inject({ method: 'GET', url: `/api/projects/${projectId}/memory`, headers })).json();
    expect(compacted.summaries).toMatchObject([{ level: 1, sourceIds: expect.arrayContaining([story[0].id, stalled.id]) }]);
    expect(compacted.summaries[0].sourceIds).toHaveLength(5);

    const [analysisAgent] = await db.select().from(agents).where(eq(agents.key, 'marie'));
    const interpretation = { controlled: [{ character: 'marie', action: 'parle' }], intentions: [],
      entities: ['marie'], time_scale: 'moment', meta_direction: null };
    const [interrupted] = await db.insert(turns).values({
      projectId: projectId!, branchId: originalBranch, seq: 100, userInput: 'Reprise',
      status: 'narrating', interpretation
    }).returning();
    await db.insert(whiteboardEntries).values({ turnId: interrupted.id, agentId: analysisAgent.id, status: 'succeeded',
      envelope: { analysis: 'Marie hésite', constraints: [], notes: [], remember: [] } });
    await db.insert(llmCalls).values({
      projectId: projectId!, turnId: interrupted.id, purpose: 'narrator', model: 'test-model', messages: [],
      status: 'succeeded', latencyMs: 1,
      response: '<resolution>{"happened":[{"text":"Marie parle","participants":["marie"]}],"time":{"label":"soir","elapsed_days":1}}</resolution><prose>Marie parle doucement.</prose>'
    });
    const lock = await pool.connect();
    try {
      await lock.query('select pg_advisory_lock(193622, hashtext($1))', [projectId]);
      expect((await app.inject({ method: 'POST', url: `/api/turns/${interrupted.id}/resume`, headers })).statusCode).toBe(409);
    } finally {
      await lock.query('select pg_advisory_unlock(193622, hashtext($1))', [projectId]);
      lock.release();
    }
    const resumed = await app.inject({ method: 'POST', url: `/api/turns/${interrupted.id}/resume`, headers });
    expect(resumed.statusCode).toBe(200);
    expect(resumed.json().messages.at(-1).event).toBe('committed');
    const recoveredCalls = await db.select().from(llmCalls).where(eq(llmCalls.turnId, interrupted.id));
    expect(recoveredCalls.map(item => item.purpose).sort()).toEqual(['guardian', 'narrator']);
    expect((await db.select().from(whiteboardEntries).where(eq(whiteboardEntries.turnId, interrupted.id)))).toHaveLength(1);

    const [analysisInterrupted] = await db.insert(turns).values({
      projectId: projectId!, branchId: originalBranch, seq: 101, userInput: 'Reprise analyse',
      status: 'analyzing', interpretation
    }).returning();
    await db.insert(llmCalls).values({
      projectId: projectId!, turnId: analysisInterrupted.id, agentId: analysisAgent.id, purpose: 'analysis',
      model: 'test-model', messages: [], status: 'succeeded', latencyMs: 1,
      response: JSON.stringify({ analysis: 'Marie hésite', constraints: [], notes: [], remember: [] })
    });
    const resumedAnalysis = await app.inject({ method: 'POST', url: `/api/turns/${analysisInterrupted.id}/resume`, headers });
    expect(resumedAnalysis.json().messages.at(-1).event).toBe('committed');
    const recoveredAnalysisCalls = await db.select().from(llmCalls).where(eq(llmCalls.turnId, analysisInterrupted.id));
    expect(recoveredAnalysisCalls.map(call => call.purpose).sort()).toEqual(['analysis', 'guardian', 'narrator']);
    expect((await db.select().from(whiteboardEntries).where(eq(whiteboardEntries.turnId, analysisInterrupted.id)))).toHaveLength(1);
    const challenges = [
      'Marie utilise ses deux mains', 'La porte s’ouvre sans clé',
      'Marie révèle que Léon a tué le baron', 'Marie accepte de donner la clé'
    ];
    for (let index = 0; index < 23; index++) {
      const next = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/turns`, headers,
        payload: { userInput: challenges[index % challenges.length] } });
      expect(next.body).toContain('event: committed');
    }
    const finalMemory = (await app.inject({ method: 'GET', url: `/api/projects/${projectId}/memory`, headers })).json();
    expect(finalMemory.state.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: 'Marie a perdu sa main gauche', status: 'active' }),
      expect.objectContaining({ text: 'La porte est verrouillée et personne ne possède la clé', status: 'active' }),
      expect.objectContaining({ text: 'Léon a tué le baron', status: 'active', public: false })
    ]));
    expect(finalMemory.summaries.some((summary: { level: number }) => summary.level === 2)).toBe(true);
    const finalTurns = (await app.inject({ method: 'GET', url: `/api/projects/${projectId}/turns`, headers })).json();
    expect(finalTurns).toHaveLength(30);
    const finalDebug = (await app.inject({ method: 'GET', url: `/api/turns/${finalTurns.at(-1).id}/debug`, headers })).json();
    const finalNarrator = finalDebug.calls.find((call: { purpose: string }) => call.purpose === 'narrator');
    expect(finalNarrator.messages[0].content).toContain('Marie a perdu sa main gauche');
    expect(finalNarrator.messages[0].content).toContain('La porte est verrouillée');
    expect(finalNarrator.messages[0].content).toContain('Marie refuse de donner la clé');
  }, 30000);
});
