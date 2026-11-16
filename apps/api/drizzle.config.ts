import { fileURLToPath } from 'node:url';

import { config as loadDotEnv } from 'dotenv';
import { defineConfig } from 'drizzle-kit';
import { z } from 'zod';

loadDotEnv({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

const databaseUrl = z.string().url().parse(process.env.DATABASE_URL);

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: databaseUrl },
  migrations: {
    schema: 'choral_writer',
  },
});
