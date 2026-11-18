import { Pool } from 'pg';

export function createTestPool(): Pool {
  return new Pool({ connectionString: process.env.DATABASE_URL });
}