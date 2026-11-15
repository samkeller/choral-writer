import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { buildApp } from './app.js';
import { loadEnv, parseAppEnv } from './env.js';
import { fileURLToPath } from 'node:url';

loadEnv();
const env = parseAppEnv();

const pool = new Pool({ connectionString: env.DATABASE_URL });
const app = await buildApp(drizzle(pool), {
  password: env.APP_PASSWORD,
  cookieSecret: env.COOKIE_SECRET,
  llmApiKey: env.LLM_API_KEY,
  llmBaseUrl: env.LLM_BASE_URL,
  llmModel: env.LLM_MODEL,
  secureCookies: env.NODE_ENV === 'production',
  staticRoot:
    env.NODE_ENV === 'production' ? fileURLToPath(new URL('../../web/dist/', import.meta.url)) : undefined,
});
app.addHook('onClose', async () => pool.end());
await app.listen({ port: env.PORT, host: '0.0.0.0' });
