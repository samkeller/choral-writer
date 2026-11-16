import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { loadConfig } from '../config.js';
import * as schema from './entities/llmCall.js';

const config = loadConfig();

export const pool = new Pool({ connectionString: config.databaseUrl });
export const db = drizzle(pool, { schema });
