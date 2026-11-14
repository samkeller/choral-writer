import { config } from 'dotenv';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { z } from 'zod';
import { buildApp } from './app.js';
import { fileURLToPath } from 'node:url';

config({ path: new URL('../../../.env', import.meta.url).pathname });
const env = z.object({
  DATABASE_URL: z.string().min(1),
  APP_PASSWORD: z.string().min(12),
  COOKIE_SECRET: z.string().min(32),
  LLM_API_KEY: z.string().min(1),
  LLM_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),
  LLM_MODEL: z.string().min(1),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development')
}).parse(process.env);

const pool = new Pool({ connectionString: env.DATABASE_URL });
const app = await buildApp(drizzle(pool), {
  password: env.APP_PASSWORD, cookieSecret: env.COOKIE_SECRET, llmApiKey: env.LLM_API_KEY,
  llmBaseUrl: env.LLM_BASE_URL, llmModel: env.LLM_MODEL, secureCookies: env.NODE_ENV === 'production',
  staticRoot: env.NODE_ENV === 'production' ? fileURLToPath(new URL('../../web/dist/', import.meta.url)) : undefined
});
app.addHook('onClose', async () => pool.end());
await app.listen({ port: env.PORT, host: '0.0.0.0' });
