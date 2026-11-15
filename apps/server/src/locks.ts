import type { Pool } from 'pg';
import { DomainError } from './memory.js';

export async function withProjectExecutionLock<T>(
  pool: Pool,
  projectId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const connection = await pool.connect();
  let locked = false;
  let result!: T;
  let operationError: unknown;
  let operationFailed = false;
  try {
    const lockResult = await connection.query<{ acquired: boolean }>(
      'select pg_try_advisory_lock(193622, hashtext($1)) as acquired',
      [projectId],
    );
    locked = lockResult.rows[0].acquired;
    if (!locked) throw new DomainError('A project operation is already running', 409);
    result = await operation();
  } catch (error) {
    operationError = error;
    operationFailed = true;
  }
  if (locked) {
    try {
      await connection.query('select pg_advisory_unlock(193622, hashtext($1))', [projectId]);
    } catch (error) {
      connection.release(true);
      throw error;
    }
  }
  connection.release();
  if (operationFailed) throw operationError;
  return result;
}
