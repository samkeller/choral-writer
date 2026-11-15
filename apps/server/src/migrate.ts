import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { loadEnv, parseDatabaseEnv } from './env.js';

loadEnv();
const { DATABASE_URL } = parseDatabaseEnv();
const pool = new Pool({ connectionString: DATABASE_URL });
try {
  await migrate(drizzle(pool), { migrationsFolder: 'drizzle' });
} finally {
  await pool.end();
}
