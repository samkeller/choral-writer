import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const appEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_PASSWORD: z.string().min(12),
  COOKIE_SECRET: z.string().min(32),
  LLM_API_KEY: z.string().min(1),
  LLM_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),
  LLM_MODEL: z.string().min(1),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});
const databaseEnvSchema = z.object({ DATABASE_URL: z.string().min(1) });

export type AppEnv = z.infer<typeof appEnvSchema>;

export function parseAppEnv(env: NodeJS.ProcessEnv = process.env): AppEnv {
  return appEnvSchema.parse(env);
}

export function parseDatabaseEnv(env: NodeJS.ProcessEnv = process.env): { DATABASE_URL: string } {
  return databaseEnvSchema.parse(env);
}

export function loadEnv() {
  const result = config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });
  if (result.error && (!('code' in result.error) || result.error.code !== 'ENOENT')) {
    throw result.error;
  }
}
