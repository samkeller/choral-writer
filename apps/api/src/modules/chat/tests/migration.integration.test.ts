import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';

/**
 * Replay the real migration SQL in a transaction-local, uniquely named schema.
 * Never touch the application's schema, even when sharing a disposable test DB.
 */
describe.skipIf(!process.env.TEST_DATABASE_URL)('chat migration with legacy data', () => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  afterAll(() => pool.end());

  async function withLegacy(run: (client: PoolClient, namespace: string, upgrade: () => Promise<void>) => Promise<void>) {
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
      await run(client, namespace, () => execute('0002_chat_branching'));
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
});
