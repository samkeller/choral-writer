import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import pg from 'pg';

import { pipe, succeeds } from './process.js';
import { WORKTREE_DATABASE_PREFIX } from './worktreeEnv.js';

const WINDOWS_POSTGRES_ROOT = 'C:\\Program Files\\PostgreSQL';
const executableSuffix = process.platform === 'win32' ? '.exe' : '';

/** Emplacement des binaires PostgreSQL ; `undefined` signifie qu'ils sont dans le PATH. */
export type PostgresBinDir = string | undefined;

/**
 * Cherche `pg_dump` et `psql` : dossier explicite (`--pg-bin` ou `PG_BIN`), puis PATH,
 * puis, sous Windows, l'installation la plus récente de `C:\Program Files\PostgreSQL`.
 */
export function findPostgresBin(explicitDir: string | undefined): PostgresBinDir {
  const hasBinaries = (dir: string) =>
    ['pg_dump', 'psql'].every((tool) => existsSync(path.join(dir, `${tool}${executableSuffix}`)));

  if (explicitDir) {
    if (hasBinaries(explicitDir)) return explicitDir;
    throw new Error(`pg_dump ou psql introuvable dans ${explicitDir}.`);
  }
  if (succeeds('pg_dump', ['--version'], { cwd: process.cwd() })) return undefined;

  if (process.platform === 'win32' && existsSync(WINDOWS_POSTGRES_ROOT)) {
    const installed = readdirSync(WINDOWS_POSTGRES_ROOT)
      .filter((version) => /^\d+$/.test(version))
      .sort((left, right) => Number(right) - Number(left))
      .map((version) => path.join(WINDOWS_POSTGRES_ROOT, version, 'bin'))
      .find(hasBinaries);
    if (installed) return installed;
  }
  throw new Error(
    'pg_dump et psql sont introuvables : ajouter leur dossier au PATH, le passer par --pg-bin <dossier> ou PG_BIN, ou utiliser --empty.',
  );
}

function tool(binDir: PostgresBinDir, name: string): string {
  return binDir ? path.join(binDir, `${name}${executableSuffix}`) : name;
}

/**
 * Variables libpq équivalentes à l'URL : les binaires reçoivent le mot de passe par
 * l'environnement, jamais en argument visible.
 */
function libpqEnv(databaseUrl: string): NodeJS.ProcessEnv {
  const url = new URL(databaseUrl);
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
  };
}

function quoteWorktreeDatabase(name: string): string {
  if (!new RegExp(`^${WORKTREE_DATABASE_PREFIX}[a-z0-9_]+$`).test(name)) {
    throw new Error(`Refus de manipuler la base « ${name} » : ce n'est pas une base de worktree.`);
  }
  return `"${name}"`;
}

/**
 * Exécute une commande de niveau serveur (CREATE/DROP DATABASE) par une connexion à
 * `serverUrl`, sans rien écrire dans cette base : la base `postgres` n'existe pas forcément.
 */
async function withServerClient<T>(
  serverUrl: string,
  query: (client: pg.Client) => Promise<T>,
): Promise<T> {
  const client = new pg.Client({ connectionString: serverUrl });
  await client.connect();
  try {
    return await query(client);
  } finally {
    await client.end();
  }
}

export function databaseExists(serverUrl: string, name: string): Promise<boolean> {
  return withServerClient(serverUrl, async (client) => {
    const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    return result.rowCount === 1;
  });
}

export async function createDatabase(serverUrl: string, name: string): Promise<void> {
  const identifier = quoteWorktreeDatabase(name);
  await withServerClient(serverUrl, (client) => client.query(`CREATE DATABASE ${identifier}`));
}

/** Supprime la base même si des connexions restent ouvertes (PostgreSQL 13+). */
export async function dropDatabase(serverUrl: string, name: string): Promise<void> {
  const identifier = quoteWorktreeDatabase(name);
  await withServerClient(serverUrl, (client) =>
    client.query(`DROP DATABASE IF EXISTS ${identifier} WITH (FORCE)`),
  );
}

/** Copie le schéma applicatif (structure et données) d'une base vers une base vide. */
export async function copySchema(options: {
  binDir: PostgresBinDir;
  schema: string;
  sourceUrl: string;
  targetUrl: string;
}): Promise<void> {
  await pipe(
    {
      command: tool(options.binDir, 'pg_dump'),
      args: ['--no-owner', '--no-privileges', '-n', options.schema],
      env: libpqEnv(options.sourceUrl),
    },
    {
      command: tool(options.binDir, 'psql'),
      args: ['--quiet', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1', '--output', nullDevice()],
      env: libpqEnv(options.targetUrl),
    },
    process.cwd(),
  );
}

function nullDevice(): string {
  return process.platform === 'win32' ? 'NUL' : '/dev/null';
}
