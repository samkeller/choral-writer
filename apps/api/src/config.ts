import { fileURLToPath } from 'node:url';

import { config as loadDotEnv } from 'dotenv';
import { z } from 'zod';

import { resolveProvider } from './llm/providers/detect.js';

loadDotEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const configSchema = z.object({
  databaseUrl: z.string().url(),
  appPassword: z.string().min(1),
  cookieSecret: z.string().min(32),
  llmApiKey: z.string().min(1),
  llmBaseUrl: z.string().url(),
  llmModel: z.string().min(1),
  /** Fournisseur explicite ; déduit de l'hôte de `LLM_BASE_URL` lorsqu'il est absent. */
  llmProvider: z.string().optional(),
  port: z.coerce.number().int().min(1).max(65535).default(3001),
  nodeEnv: z.enum(['development', 'test', 'production']).default('development'),
});

export type AppConfig = z.infer<typeof configSchema>;
export type AuthConfig = Pick<AppConfig, 'appPassword' | 'cookieSecret' | 'nodeEnv'>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return configSchema.parse({
    databaseUrl: env.DATABASE_URL,
    appPassword: env.APP_PASSWORD,
    cookieSecret: env.COOKIE_SECRET,
    llmApiKey: env.LLM_API_KEY,
    llmBaseUrl: env.LLM_BASE_URL,
    llmModel: env.LLM_MODEL,
    llmProvider: env.LLM_PROVIDER,
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
  });
}

/** Fournisseur effectif : explicite s'il est configuré, sinon déduit de l'hôte de l'API. */
export function configuredProvider(config: AppConfig) {
  return resolveProvider(config.llmProvider, config.llmBaseUrl);
}
