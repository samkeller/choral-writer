/**
 * Crée ou supprime un worktree prêt à tester : branche, `.env` dédié (port d'API et base
 * `choral_writer_wt_<nom>`), dépendances, migrations. Voir `docs/DEVELOPMENT.md`.
 */
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { parseArgs } from 'node:util';

import {
  addWorktree,
  assertBranchName,
  branchExists,
  deleteBranch,
  fetchBase,
  hasLocalChanges,
  isMergedInto,
  listWorktrees,
  mainCheckoutDir,
  pruneWorktrees,
} from './git.js';
import { runPnpm } from './process.js';
import {
  copySchema,
  createDatabase,
  databaseExists,
  dropDatabase,
  findPostgresBin,
} from './postgres.js';
import { planRemoval } from './removalPlan.js';
import {
  DEFAULT_API_PORT,
  deriveWorktreeEnv,
  FIRST_WORKTREE_PORT,
  nextUnreservedPort,
  readEnvValue,
  withDatabaseName,
  worktreeDatabaseName,
} from './worktreeEnv.js';

const APP_SCHEMA = 'choral_writer';
const DEFAULT_BASE = 'feat/v2';

const USAGE = `Usage :
  pnpm wt:new <nom> [--branch <branche>] [--base <branche>] [--empty] [--first-port <port>] [--pg-bin <dossier>] [--parent-dir <dossier>]
  pnpm wt:remove <nom> [--branch <branche>] [--base <branche>] [--force] [--parent-dir <dossier>]`;

interface Context {
  name: string;
  mainDir: string;
  parentDir: string;
  worktreeDir: string;
  databaseName: string;
  /** Branche créée par `wt:new` ; pour `wt:remove`, celle visée si aucun worktree n'est enregistré. */
  branch: string;
  base: string;
}

function resolveContext(
  name: string,
  values: { base?: string; branch?: string; 'parent-dir'?: string },
): Context {
  const databaseName = worktreeDatabaseName(name);
  const mainDir = mainCheckoutDir(process.cwd());
  const branch = values.branch ?? `feat/${name}`;
  const base = values.base ?? DEFAULT_BASE;
  assertBranchName(mainDir, branch);
  assertBranchName(mainDir, base);
  // Relatif au checkout principal : pnpm lance ce script depuis `apps/api`.
  const parentDir = path.resolve(
    mainDir,
    values['parent-dir'] ?? process.env.CHORAL_WT_DIR ?? path.join('..', 'choral-wt'),
  );
  return {
    name,
    mainDir,
    parentDir,
    worktreeDir: path.resolve(parentDir, name),
    databaseName,
    branch,
    base,
  };
}

function readMainEnv(mainDir: string): { content: string; databaseUrl: string } {
  const envPath = path.join(mainDir, '.env');
  if (!existsSync(envPath)) throw new Error(`Fichier introuvable : ${envPath}`);
  const content = readFileSync(envPath, 'utf8');
  const databaseUrl = readEnvValue(content, 'DATABASE_URL');
  if (!databaseUrl) throw new Error(`DATABASE_URL est absente de ${envPath}.`);
  return { content, databaseUrl };
}

/** Ports d'API déjà attribués dans le `.env` d'un checkout du dépôt. */
function reservedPorts(mainDir: string): Set<number> {
  const ports = listWorktrees(mainDir).flatMap((worktree) => {
    const envPath = path.join(worktree.path, '.env');
    if (!existsSync(envPath)) return [];
    const port = Number(readEnvValue(readFileSync(envPath, 'utf8'), 'PORT') ?? DEFAULT_API_PORT);
    return Number.isInteger(port) ? [port] : [];
  });
  return new Set(ports);
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen({ host: '0.0.0.0', port }, () => server.close(() => resolve(true)));
  });
}

async function pickApiPort(mainDir: string, firstPort: number): Promise<number> {
  const reserved = reservedPorts(mainDir);
  for (;;) {
    const port = nextUnreservedPort(reserved, firstPort);
    if (await isPortFree(port)) return port;
    reserved.add(port);
  }
}

/**
 * Option `--store-dir` du checkout principal, pour réutiliser ses paquets ; aucune
 * option si ce checkout n'est pas installé (pnpm prend alors son store par défaut).
 */
function mainStoreDirArgs(mainDir: string): string[] {
  // Malgré son extension, pnpm écrit ce fichier en JSON.
  const modulesYaml = path.join(mainDir, 'node_modules', '.modules.yaml');
  if (!existsSync(modulesYaml)) return [];
  const { storeDir } = JSON.parse(readFileSync(modulesYaml, 'utf8')) as { storeDir?: unknown };
  return typeof storeDir === 'string' ? ['--store-dir', storeDir] : [];
}

async function createWorktree(
  context: Context,
  options: { empty: boolean; firstPort: number; pgBin?: string },
): Promise<void> {
  const { mainDir, worktreeDir, databaseName, branch, base } = context;
  const mainEnv = readMainEnv(mainDir);
  const binDir = options.empty ? undefined : findPostgresBin(options.pgBin ?? process.env.PG_BIN);

  if (existsSync(worktreeDir)) throw new Error(`Le dossier existe déjà : ${worktreeDir}`);
  if (await databaseExists(mainEnv.databaseUrl, databaseName)) {
    throw new Error(`La base ${databaseName} existe déjà.`);
  }
  const port = await pickApiPort(mainDir, options.firstPort);
  const storeDirArgs = mainStoreDirArgs(mainDir);

  fetchBase(mainDir, base);
  addWorktree(mainDir, worktreeDir, branch, base);
  try {
    writeFileSync(
      path.join(worktreeDir, '.env'),
      deriveWorktreeEnv(mainEnv.content, { databaseName, port }),
    );
    const testsEnv = path.join(mainDir, '.env.tests');
    if (existsSync(testsEnv)) copyFileSync(testsEnv, path.join(worktreeDir, '.env.tests'));
    else console.warn(`${testsEnv} est absent : les tests PostgreSQL seront ignorés.`);

    console.log(`\nCréation de la base ${databaseName}…`);
    await createDatabase(mainEnv.databaseUrl, databaseName);
    if (!options.empty) {
      console.log(`Copie du schéma ${APP_SCHEMA} depuis la base du checkout principal…`);
      await copySchema({
        binDir,
        schema: APP_SCHEMA,
        sourceUrl: mainEnv.databaseUrl,
        targetUrl: withDatabaseName(mainEnv.databaseUrl, databaseName),
      });
    }

    runPnpm(['install', '--frozen-lockfile', ...storeDirArgs], worktreeDir);
    runPnpm(['db:migrate'], worktreeDir);
    runPnpm(['--filter', '@choral-writer/shared', 'build'], worktreeDir);
  } catch (error) {
    console.error(
      `\nLa préparation a échoué ; nettoyer avec : pnpm wt:remove ${context.name} --branch ${branch} --force`,
    );
    throw error;
  }

  console.log(`
Worktree prêt : ${worktreeDir}
  branche : ${branch} (depuis origin/${base})
  base    : ${databaseName}${options.empty ? ' (vide + migrations)' : ''}
  API     : port ${port} ; Vite prend 5175 ou le port libre suivant
Démarrer : cd "${worktreeDir}" && pnpm dev`);
}

/** `undefined` quand git ne lit plus le dossier, par exemple après une suppression interrompue. */
function readLocalChanges(dir: string): boolean | undefined {
  try {
    return hasLocalChanges(dir);
  } catch {
    return undefined;
  }
}

async function deleteWorktree(context: Context, force: boolean): Promise<void> {
  const { mainDir, parentDir, worktreeDir, databaseName, base } = context;
  const fromWorktree = path.relative(worktreeDir, process.cwd());
  if (!fromWorktree.startsWith('..') && !path.isAbsolute(fromWorktree)) {
    throw new Error('Lancer la suppression depuis un autre checkout que le worktree supprimé.');
  }
  const dirExists = existsSync(worktreeDir);
  const plan = planRemoval({
    mainDir,
    parentDir,
    worktreeDir,
    worktrees: listWorktrees(mainDir),
    dirExists,
    hasLocalChanges: dirExists ? readLocalChanges(worktreeDir) : false,
    fallbackBranch: context.branch,
    fallbackBranchExists: branchExists(mainDir, context.branch),
    isMerged: (branch) => {
      fetchBase(mainDir, base);
      return isMergedInto(mainDir, branch, base);
    },
    force,
  });

  // Ordre choisi pour qu'une relance reprenne là où une étape a échoué :
  // dossier (un fichier verrouillé sous Windows l'interrompt), worktree, branche, base.
  if (plan.removeDir) {
    console.log(`Suppression de ${worktreeDir}…`);
    rmSync(worktreeDir, { recursive: true, force: true, maxRetries: 5 });
  }
  pruneWorktrees(mainDir);
  if (plan.branch) deleteBranch(mainDir, plan.branch);

  await dropDatabase(readMainEnv(mainDir).databaseUrl, databaseName);
  console.log(`Base ${databaseName} supprimée (si elle existait).`);
}

function parsePort(value: string | undefined): number {
  if (value === undefined) return FIRST_WORKTREE_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Port invalide : « ${value} ».`);
  }
  return port;
}

async function main(argv: string[]): Promise<void> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      base: { type: 'string' },
      branch: { type: 'string' },
      empty: { type: 'boolean', default: false },
      'first-port': { type: 'string' },
      force: { type: 'boolean', default: false },
      'parent-dir': { type: 'string' },
      'pg-bin': { type: 'string' },
    },
  });
  const [command, name, ...extra] = positionals;
  if (!name || extra.length > 0) throw new Error(USAGE);

  const context = resolveContext(name, values);
  if (command === 'new') {
    await createWorktree(context, {
      empty: values.empty,
      firstPort: parsePort(values['first-port']),
      pgBin: values['pg-bin'],
    });
  } else if (command === 'remove') {
    await deleteWorktree(context, values.force);
  } else {
    throw new Error(USAGE);
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
