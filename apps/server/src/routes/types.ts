import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import type { LlmClient } from '@choral/engine';
import { z } from 'zod';

export type Settings = {
  password: string;
  cookieSecret: string;
  llmApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
  secureCookies: boolean;
  staticRoot?: string;
};

export type RouteDependencies = {
  db: NodePgDatabase & { $client: Pool };
  settings: Settings;
  client: LlmClient;
};

export const projectIdSchema = z.object({ id: z.string().uuid() });
