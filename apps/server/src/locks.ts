import type { Pool } from 'pg';
import { DomainError } from './memory.js';

export async function withProjectExecutionLock<T>(pool: Pool, projectId: string, operation: () => Promise<T>): Promise<T> {
  const connection = await pool.connect();
  let locked = false;
  try {
    const result = await connection.query<{ acquired: boolean }>(
      'select pg_try_advisory_lock(193622, hashtext($1)) as acquired', [projectId]
    );
    locked = result.rows[0].acquired;
    if (!locked) throw new DomainError('A project operation is already running', 409);
    return await operation();
  } finally {
    if (locked) {
      try {
        await connection.query('select pg_advisory_unlock(193622, hashtext($1))', [projectId]);
      } catch (error) {
        connection.release(true);
        throw error;
      }
    }
    connection.release();
  }
}
