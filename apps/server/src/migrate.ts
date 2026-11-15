import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { loadEnv } from './env.js';

loadEnv();
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required (set it in the environment or the root .env file)');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  await migrate(drizzle(pool), { migrationsFolder: 'drizzle' });
} finally {
  await pool.end();
}
