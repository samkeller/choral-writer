import { readFile } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool, type PoolClient } from 'pg';
import { v7 as uuid } from 'uuid';
import { memoryReadSchema, memoryStateSchema } from '@choral-writer/shared';

describe.skipIf(!process.env.TEST_DATABASE_URL)('v1 memory migration on PostgreSQL', () => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  let client: PoolClient;
  let migration: string;

  beforeAll(async () => {
    await migrate(drizzle(pool), { migrationsFolder: './src/db/migrations', migrationsSchema: 'choral_writer' });
    client = await pool.connect();
    migration = await readFile(new URL('../../../db/migrations/0008_m6_tags.sql', import.meta.url), 'utf8');
  }, 15_000);
  beforeEach(async () => {
    await client.query('BEGIN');
  });
  afterEach(async () => {
    await client.query('ROLLBACK');
  });
  afterAll(async () => {
    if (client) client.release();
    await pool.end();
  });

  it('preserves filtered access, branches, historical scopes, metadata and v2 rows', async () => {
    const project = uuid();
    const missingSettingsProject = uuid();
    const branch = uuid();
    const branch2 = uuid();
    const otherBranch = uuid();
    const message = uuid();
    const turn = uuid();
    const otherMessage = uuid();
    const otherTurn = uuid();
    const unchangedMessage = uuid();
    const unchangedTurn = uuid();
    const scope = { id: uuid(), name: 'Places', instructions: 'World facts', writable: false, archived: false };
    const archived = { id: uuid(), name: 'places', instructions: 'Old facts', writable: true, archived: true };
    const historical = { id: uuid(), name: 'Places', instructions: 'Historical', writable: true, archived: false };
    const templates = [{ id: uuid(), name: 'Template', instructions: 'Retain me', writable: true }];
    const entry = (scopeId: string, key: string, tags: string[], isArchived = false) => ({
      id: uuid(), scopeId, key, content: `content ${key}`, tags, archived: isArchived,
      source: 'user', turnId: null, updatedAt: '2025-01-01T00:00:00.000Z',
    });
    const tagged = entry(scope.id, 'city', ['map']);
    const prefixed = entry(scope.id, 'secret-door', []);
    const notMatched = entry(scope.id, 'other', ['else']);
    const inArchivedScope = entry(archived.id, 'city', ['map']);
    const archivedEntry = entry(scope.id, 'old', ['map'], true);
    const historicalEntry = entry(historical.id, 'historic', ['map']);
    const entries = [tagged, prefixed, notMatched, inArchivedScope, archivedEntry];
    const snapshot = { v: 1, scopes: [scope, archived, historical], templates, entries: [historicalEntry, tagged] };
    const v2Snapshot = { v: 2, tags: [], entries: [] };

    await client.query('INSERT INTO choral_writer.projects (id, name, system_prompt) VALUES ($1, $2, $3), ($4, $2, $3)', [project, 'migration fixture', '', missingSettingsProject]);
    await client.query('INSERT INTO choral_writer.chat_branch (id, project_id, name) VALUES ($1, $2, $3), ($4, $2, $3), ($5, $6, $3)', [branch, project, 'fixture', branch2, otherBranch, missingSettingsProject]);
    await client.query("INSERT INTO choral_writer.chat_message (id, project_id, role, content) VALUES ($1, $2, 'user', 'x'), ($3, $4, 'user', 'x')", [message, project, otherMessage, missingSettingsProject]);
    await client.query("INSERT INTO choral_writer.chat_turn (id, project_id, origin_branch_id, user_message_id, status, memory_snapshot) VALUES ($1, $2, $3, $4, 'failed', $5), ($6, $7, $8, $9, 'failed', $5)", [turn, project, branch, message, snapshot, otherTurn, missingSettingsProject, otherBranch, otherMessage]);
    await client.query("INSERT INTO choral_writer.chat_message (id, project_id, role, content) VALUES ($1, $2, 'user', 'x')", [unchangedMessage, project]);
    await client.query("INSERT INTO choral_writer.chat_turn (id, project_id, origin_branch_id, user_message_id, status, memory_snapshot) VALUES ($1, $2, $3, $4, 'failed', $5)", [unchangedTurn, project, branch2, unchangedMessage, v2Snapshot]);
    await client.query('INSERT INTO choral_writer.memory_settings (project_id, revision_id, enabled, catalog) VALUES ($1, $2, true, $3)', [project, uuid(), { v: 1, scopes: [scope, archived], templates }]);
    await client.query('INSERT INTO choral_writer.memory_bank (branch_id, project_id, revision_id, entries) VALUES ($1, $2, $3, $4), ($5, $2, $6, $7), ($8, $9, $10, $11)', [branch, project, uuid(), { v: 1, entries }, branch2, uuid(), { v: 2, entries: [] }, otherBranch, missingSettingsProject, uuid(), { v: 1, entries: [historicalEntry] }]);
    const agents = [uuid(), uuid(), uuid(), uuid(), uuid()];
    const reads = [
      { mode: 'selected', scopeIds: [scope.id, archived.id], tags: ['map'], keyPrefixes: ['secret-'] },
      { mode: 'selected', scopeIds: [scope.id, historical.id], tags: [], keyPrefixes: [] },
      null,
      { mode: 'none', scopeIds: [], tags: [], keyPrefixes: [] },
      { mode: 'all', tagIds: [] },
    ];
    for (const [index, agent] of agents.entries()) {
      await client.query("INSERT INTO choral_writer.agent (id, phase, output) VALUES ($1, 'analysis', 'envelope')", [agent]);
      await client.query("INSERT INTO choral_writer.agent_version (id, agent_id, version, name, instructions) VALUES ($1, $1, 1, 'fixture', '')", [agent]);
      await client.query("INSERT INTO choral_writer.project_agent (project_id, agent_id, version_id, phase, output, memory_read) VALUES ($1, $2, $2, 'analysis', 'envelope', $3)", [project, agent, reads[index]]);
    }
    const narrator = uuid();
    await client.query("INSERT INTO choral_writer.agent (id, phase, output) VALUES ($1, 'restitution', 'narrative')", [narrator]);
    await client.query("INSERT INTO choral_writer.agent_version (id, agent_id, version, name, instructions) VALUES ($1, $1, 1, 'fixture', '')", [narrator]);
    await client.query("INSERT INTO choral_writer.project_agent (project_id, agent_id, version_id, phase, output, memory_read) VALUES ($1, $2, $2, 'restitution', 'narrative', NULL)", [project, narrator]);
    await client.query('SAVEPOINT before_migration');
    await client.query(migration);
    const settings = (await client.query('SELECT catalog, enabled FROM choral_writer.memory_settings WHERE project_id = $1', [project])).rows[0];
    const bank = (await client.query('SELECT entries FROM choral_writer.memory_bank WHERE branch_id = $1', [branch])).rows[0].entries;
    const convertedSnapshot = (await client.query('SELECT memory_snapshot FROM choral_writer.chat_turn WHERE id = $1', [turn])).rows[0].memory_snapshot;
    const convertedReads = (await client.query('SELECT agent_id, memory_read FROM choral_writer.project_agent WHERE project_id = $1', [project])).rows;
    const byAgent = new Map(convertedReads.map((row) => [row.agent_id, memoryReadSchema.parse(row.memory_read)]));
    const state = memoryStateSchema.parse({ ...settings.catalog, entries: bank.entries });
    memoryStateSchema.parse(convertedSnapshot);
    expect(settings.enabled).toBe(true);
    expect(settings.catalog.legacy).toEqual({ scopes: [scope, archived], templates });
    expect(convertedSnapshot.legacy).toEqual({ scopes: [scope, archived, historical], templates });
    expect(state.tags).toHaveLength(5);
    expect(new Set(state.tags.map((tag) => tag.name.toLowerCase())).size).toBe(5);
    expect(state.tags.some((tag) => tag.id === historical.id)).toBe(true);
    const visible = (agent: string) => state.entries.filter((item) => !item.archived && item.tagIds.some((tag) => byAgent.get(agent)?.tagIds.includes(tag))).map((item) => item.key);
    expect(visible(agents[0])).toEqual(['city', 'secret-door']);
    expect(visible(agents[1])).toEqual(['city', 'secret-door', 'other']);
    expect(byAgent.get(agents[2])).toEqual({ mode: 'none', tagIds: [] });
    expect(byAgent.get(agents[3])).toEqual({ mode: 'none', tagIds: [] });
    expect(byAgent.get(agents[4])).toEqual(reads[4]);
    expect(byAgent.get(narrator)).toEqual({ mode: 'all', tagIds: [] });
    expect(state.entries[0].protected).toBe(true);
    expect(state.entries[0].legacy).toEqual({ scopeId: scope.id, scopeName: scope.name, scopeInstructions: scope.instructions, tags: ['map'] });
    expect(state.entries[3].archived).toBe(true);
    expect(state.entries[4].archived).toBe(true);
    expect(convertedSnapshot.entries[0].tagIds).toContain(byAgent.get(agents[1])?.tagIds[0]);
    expect((await client.query('SELECT memory_snapshot FROM choral_writer.chat_turn WHERE id = $1', [unchangedTurn])).rows[0].memory_snapshot).toEqual(v2Snapshot);
    expect((await client.query('SELECT entries FROM choral_writer.memory_bank WHERE branch_id = $1', [branch2])).rows[0].entries).toEqual({ v: 2, entries: [] });
    const recovered = (await client.query('SELECT catalog, enabled FROM choral_writer.memory_settings WHERE project_id = $1', [missingSettingsProject])).rows[0];
    const recoveredBank = (await client.query('SELECT entries FROM choral_writer.memory_bank WHERE branch_id = $1', [otherBranch])).rows[0].entries;
    expect(recovered.enabled).toBe(false);
    expect(recovered.catalog.legacy).toEqual({ scopes: snapshot.scopes, templates });
    expect(memoryStateSchema.parse({ ...recovered.catalog, entries: recoveredBank.entries }).entries[0].legacy?.scopeName).toBe('Places');
    await client.query(migration);
    expect((await client.query('SELECT catalog FROM choral_writer.memory_settings WHERE project_id = $1', [project])).rows[0].catalog).toEqual(settings.catalog);
    expect((await client.query('SELECT entries FROM choral_writer.memory_bank WHERE branch_id = $1', [branch])).rows[0].entries).toEqual(bank);
    expect((await client.query('SELECT memory_snapshot FROM choral_writer.chat_turn WHERE id = $1', [turn])).rows[0].memory_snapshot).toEqual(convertedSnapshot);
    await client.query('ROLLBACK TO SAVEPOINT before_migration');
  });

  it('fails rather than discard entries whose scope metadata cannot be recovered', async () => {
    const project = uuid();
    const branch = uuid();
    await client.query("INSERT INTO choral_writer.projects (id, name, system_prompt) VALUES ($1, 'fixture', '')", [project]);
    await client.query("INSERT INTO choral_writer.chat_branch (id, project_id, name) VALUES ($1, $2, 'fixture')", [branch, project]);
    await client.query('INSERT INTO choral_writer.memory_bank (branch_id, project_id, revision_id, entries) VALUES ($1, $2, $3, $4)', [branch, project, uuid(), { v: 1, entries: [{
      id: uuid(), scopeId: uuid(), key: 'lost', content: 'value', tags: [], archived: false,
      source: 'user', turnId: null, updatedAt: '2025-01-01T00:00:00.000Z',
    }] }]);
    await client.query('SAVEPOINT malformed');
    await expect(client.query(migration)).rejects.toThrow('references unknown scope');
    await client.query('ROLLBACK TO SAVEPOINT malformed');
    expect((await client.query('SELECT entries FROM choral_writer.memory_bank WHERE branch_id = $1', [branch])).rows[0].entries.v).toBe(1);
  });
});
