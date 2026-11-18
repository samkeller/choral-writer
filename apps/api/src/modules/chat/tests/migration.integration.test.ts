import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';

import { createTestPool } from '../../../tests/testDb.js';

/**
 * Replay the real migration SQL in a transaction-local, uniquely named schema.
 * Never touch the application's schema, even when sharing a disposable test DB.
 */
describe.skipIf(!process.env.DATABASE_URL)('chat migration with legacy data', () => {
  const pool = createTestPool();
  afterAll(() => pool.end());

  async function withLegacy(run: (
    client: PoolClient, namespace: string, upgrade: () => Promise<void>, execute: (name: string) => Promise<void>,
  ) => Promise<void>) {
    const client = await pool.connect();
    const namespace = `chat_upgrade_${randomUUID().replaceAll('-', '')}`;
    const execute = async (name: string) => {
      const source = await readFile(new URL(`../../../db/migrations/${name}.sql`, import.meta.url), 'utf8');
      await client.query(source.replaceAll('choral_writer', namespace));
    };
    try {
      await client.query('BEGIN');
      await client.query(`CREATE SCHEMA ${namespace}`);
      await execute('0000_wet_joshua_kane');
      await execute('0001_last_wolfpack');
      await run(client, namespace, () => execute('0002_chat_branching'), execute);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  }

  it('preserves ordered successful and failed turns, messages, traces and empty projects', async () => {
    await withLegacy(async (client, ns, upgrade) => {
      const projectId = '019ad30c-19b0-7000-8000-000000000001';
      const emptyId = '019ad30c-19b0-7000-8000-000000000002';
      const userId = '019ad30c-19b0-7000-8000-000000000003';
      const assistantId = '019ad30c-19b0-7000-8000-000000000004';
      const failedUserId = '019ad30c-19b0-7000-8000-000000000005';
      const completedId = '019ad30c-19b0-7000-8000-000000000006';
      const failedId = '019ad30c-19b0-7000-8000-000000000007';
      await client.query(`INSERT INTO ${ns}.projects(id,name,system_prompt) VALUES
        ($1,'Ancien projet','Prompt'),($2,'Projet vide','')`, [projectId, emptyId]);
      await client.query(`INSERT INTO ${ns}.messages(id,project_id,role,content) VALUES
        ($1,$4,'user','Saisie'),($2,$4,'assistant','Réponse'),($3,$4,'user','Échec')`,
      [userId, assistantId, failedUserId, projectId]);
      await client.query(`INSERT INTO ${ns}.turns
        (id,project_id,user_message_id,assistant_message_id,status) VALUES
        ($1,$3,$4,$5,'completed'),($2,$3,$6,null,'failed')`,
      [completedId, failedId, projectId, userId, assistantId, failedUserId]);
      await client.query(`INSERT INTO ${ns}.llm_call
        (id,turn_id,stage,model,request,response,duration_ms,status)
        VALUES ($1,$2,'narrator','test','{}','Réponse',1,'success')`, [randomUUID(), completedId]);

      await upgrade();
      const branches = await client.query(`SELECT * FROM ${ns}.chat_branch ORDER BY project_id`);
      expect(branches.rows).toMatchObject([
        { project_id: projectId, head_turn_id: failedId, fork_turn_id: null },
        { project_id: emptyId, head_turn_id: null },
      ]);
      const turns = await client.query(`SELECT * FROM ${ns}.chat_turn ORDER BY id`);
      expect(turns.rows).toMatchObject([
        { id: completedId, parent_turn_id: null, origin_branch_id: projectId, assistant_message_id: assistantId },
        { id: failedId, parent_turn_id: completedId, status: 'failed' },
      ]);
      expect((await client.query(`SELECT * FROM ${ns}.chat_message`)).rowCount).toBe(3);
      expect((await client.query(`SELECT * FROM ${ns}.llm_call WHERE turn_id=$1`, [completedId])).rowCount).toBe(1);
      const defaults = await client.query(`SELECT id,default_branch_id FROM ${ns}.projects ORDER BY id`);
      expect(defaults.rows).toEqual([
        { id: projectId, default_branch_id: projectId },
        { id: emptyId, default_branch_id: emptyId },
      ]);
    });
  });

  it('refuses orphaned history instead of silently losing it', async () => {
    await withLegacy(async (client, ns, upgrade) => {
      const projectId = randomUUID();
      await client.query(`INSERT INTO ${ns}.projects(id,name,system_prompt) VALUES($1,'Incohérent','')`, [projectId]);
      await client.query(`INSERT INTO ${ns}.messages(id,project_id,role,content) VALUES($1,$2,'user','Orphelin')`,
        [randomUUID(), projectId]);
      await expect(upgrade()).rejects.toThrow('Cannot migrate inconsistent chat history');
    });
  });

  it('preserves legacy agents as versions and fills required restitution contracts', async () => {
    await withLegacy(async (client, ns, upgrade, execute) => {
      const projectId = randomUUID();
      const emptyId = randomUUID();
      const narratorId = randomUUID();
      const otherNarratorId = randomUUID();
      const analysisId = randomUUID();
      await client.query(`INSERT INTO ${ns}.projects(id,name,system_prompt) VALUES
        ($1,'Ancien projet','Prompt'),($2,'Sans agents','')`, [projectId, emptyId]);
      await upgrade();
      await execute('0003_ambitious_human_torch');
      await client.query(`INSERT INTO ${ns}.agent
        (id, project_id, name, role, instructions, enabled, position) VALUES
        ($1,$4,'Réponse existante','narrator','Conserver ce ton.',true,0),
        ($2,$4,'Autre réponse','narrator','Ancienne variante.',true,1),
        ($3,$4,'Analyse inactive','analysis','Ne pas perdre.',false,2)`,
      [narratorId, otherNarratorId, analysisId, projectId]);
      await execute('0004_agent_library');

      const versions = await client.query(`SELECT agent_id, instructions, version FROM ${ns}.agent_version
        WHERE agent_id = ANY($1::uuid[])`, [[narratorId, otherNarratorId, analysisId]]);
      expect(versions.rows).toHaveLength(3);
      expect(versions.rows).toEqual(expect.arrayContaining([
        { agent_id: narratorId, instructions: 'Conserver ce ton.', version: 1 },
        { agent_id: analysisId, instructions: 'Ne pas perdre.', version: 1 },
      ]));
      const assignments = await client.query(`SELECT * FROM ${ns}.project_agent`);
      expect(assignments.rows).toHaveLength(4);
      expect(assignments.rows).toEqual(expect.arrayContaining([
        expect.objectContaining({ project_id: projectId, agent_id: narratorId, output: 'narrative' }),
        expect.objectContaining({ project_id: emptyId, output: 'memory_proposals' }),
      ]));
      expect(assignments.rows.some((row) => row.agent_id === otherNarratorId || row.agent_id === analysisId)).toBe(false);
    });
  });

  it('publishes the requested defaults without overwriting versions or upgrading existing projects', async () => {
    await withLegacy(async (client, ns, upgrade, execute) => {
      await client.query(`INSERT INTO ${ns}.projects(id,name,system_prompt) VALUES($1,'Projet existant','')`, [randomUUID()]);
      await upgrade();
      await execute('0003_ambitious_human_torch');
      await execute('0004_agent_library');
      const before = (await client.query(`SELECT * FROM ${ns}.project_agent ORDER BY agent_id`)).rows;
      const narratorId = '019aee00-0000-7000-8000-000000000001';
      const guardianId = '019aee00-0000-7000-8000-000000000002';
      await client.query(`INSERT INTO ${ns}.agent_version(id,agent_id,version,name,instructions)
        VALUES($1,$2,2,'Narrateur personnalisé','Conserver cette version.')`, [randomUUID(), narratorId]);

      await execute('0005_default_agent_prompts');

      const versions = (await client.query(`SELECT agent_id,version,instructions FROM ${ns}.agent_version
        ORDER BY agent_id,version`)).rows;
      expect(versions).toEqual([
        { agent_id: narratorId, version: 1, instructions: '' },
        { agent_id: narratorId, version: 2, instructions: 'Conserver cette version.' },
        { agent_id: narratorId, version: 3, instructions: 'Produis toujours une restitution pertinente à partir du contexte disponible. Ne laisse jamais ta réponse vide, même si les informations sont limitées. Sois créatif.' },
        { agent_id: guardianId, version: 1, instructions: '' },
        { agent_id: guardianId, version: 2, instructions: 'Examine toujours le contexte et retourne une réponse structurée. Ne laisse jamais ta sortie vide : retourne une liste vide si aucune proposition pertinente n\'est à faire.' },
      ]);
      expect((await client.query(`SELECT * FROM ${ns}.project_agent ORDER BY agent_id`)).rows).toEqual(before);
    });
  });
});
