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
  deleteBranch,
  fetchBase,
  hasLocalChanges,
  isMergedInto,
  listWorktrees,
  mainCheckoutDir,
  pruneWorktrees,
  samePath,
} from './git.js';
import { runPnpm } from './process.js';
import {
  copySchema,
  createDatabase,
  databaseExists,
  dropDatabase,
  findPostgresBin,
} from './postgres.js';
import {
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
  pnpm wt:new <nom> [--branch <branche>] [--base <branche>] [--empty] [--pg-bin <dossier>] [--parent-dir <dossier>]
  pnpm wt:remove <nom> [--base <branche>] [--force] [--parent-dir <dossier>]`;

interface Context {
  name: string;
  mainDir: string;
  worktreeDir: string;
  databaseName: string;
  base: string;
}

function resolveContext(name: string, values: { base?: string; 'parent-dir'?: string }): Context {
  const databaseName = worktreeDatabaseName(name);
  const mainDir = mainCheckoutDir(process.cwd());
  // Relatif au checkout principal : pnpm lance ce script depuis `apps/api`.
  const parentDir = path.resolve(
    mainDir,
    values['parent-dir'] ?? process.env.CHORAL_WT_DIR ?? path.join('..', 'choral-wt'),
  );
  return {
    name,
    mainDir,
    worktreeDir: path.resolve(parentDir, name),
    databaseName,
    base: values.base ?? DEFAULT_BASE,
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
    const port = Number(readEnvValue(readFileSync(envPath, 'utf8'), 'PORT') ?? 3001);
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

async function pickApiPort(mainDir: string): Promise<number> {
  const reserved = reservedPorts(mainDir);
  for (;;) {
    const port = nextUnreservedPort(reserved, FIRST_WORKTREE_PORT);
    if (await isPortFree(port)) return port;
    reserved.add(port);
  }
}

/**
 * Option `--store-dir` du checkout principal, pour réutiliser ses paquets ; aucune
 * option si ce checkout n'est pas installé (pnpm prend alors son store par défaut).
 */
function mainStoreDirArgs(mainDir: string): string[] {
  const modulesYaml = path.join(mainDir, 'node_modules', '.modules.yaml');
  if (!existsSync(modulesYaml)) return [];
  const match = /"?storeDir"?:\s*"?([^"\r\n]+)"?/.exec(readFileSync(modulesYaml, 'utf8'));
  return match ? ['--store-dir', JSON.parse(`"${match[1]}"`) as string] : [];
}

async function createWorktree(
  context: Context,
  options: { branch: string; empty: boolean; pgBin?: string },
): Promise<void> {
  const { mainDir, worktreeDir, databaseName, base } = context;
  const mainEnv = readMainEnv(mainDir);
  const binDir = options.empty ? undefined : findPostgresBin(options.pgBin ?? process.env.PG_BIN);

  if (existsSync(worktreeDir)) throw new Error(`Le dossier existe déjà : ${worktreeDir}`);
  if (await databaseExists(mainEnv.databaseUrl, databaseName)) {
    throw new Error(`La base ${databaseName} existe déjà.`);
  }
  const port = await pickApiPort(mainDir);
  const storeDirArgs = mainStoreDirArgs(mainDir);

  fetchBase(mainDir, base);
  addWorktree(mainDir, worktreeDir, options.branch, base);
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
      `\nLa préparation a échoué ; nettoyer avec : pnpm wt:remove ${context.name} --force`,
    );
    throw error;
  }

  console.log(`
Worktree prêt : ${worktreeDir}
  branche : ${options.branch} (depuis origin/${base})
  base    : ${databaseName}${options.empty ? ' (vide + migrations)' : ''}
  API     : port ${port} ; Vite prend 5175 ou le port libre suivant
Démarrer : cd "${worktreeDir}" && pnpm dev`);
}

async function deleteWorktree(context: Context, force: boolean): Promise<void> {
  const { mainDir, worktreeDir, databaseName, base } = context;
  const fromWorktree = path.relative(worktreeDir, process.cwd());
  if (!fromWorktree.startsWith('..') && !path.isAbsolute(fromWorktree)) {
    throw new Error('Lancer la suppression depuis un autre checkout que le worktree supprimé.');
  }
  const worktree = listWorktrees(mainDir).find((entry) => samePath(entry.path, worktreeDir));
  const branch = worktree?.branch;
  const hasFiles = existsSync(worktreeDir);

  if (!worktree && hasFiles) {
    throw new Error(`${worktreeDir} n'est pas un worktree du dépôt : le supprimer à la main.`);
  }
  if (!force) {
    if (hasFiles && hasLocalChanges(worktreeDir)) {
      throw new Error(
        `${worktreeDir} contient des modifications non commitées ; relancer avec --force pour les perdre.`,
      );
    }
    if (branch) {
      fetchBase(mainDir, base);
      if (!isMergedInto(mainDir, branch, base)) {
        throw new Error(
          `La branche ${branch} n'est pas fusionnée dans origin/${base} ; relancer avec --force pour la supprimer quand même.`,
        );
      }
    }
  }

  if (hasFiles) {
    // Supprimer le dossier avant de désenregistrer le worktree : si un fichier reste
    // verrouillé (serveur encore lancé sous Windows), une nouvelle tentative reste possible.
    console.log(`Suppression de ${worktreeDir}…`);
    rmSync(worktreeDir, { recursive: true, force: true, maxRetries: 5 });
  } else {
    console.warn(`Aucun dossier ${worktreeDir}.`);
  }
  pruneWorktrees(mainDir);

  await dropDatabase(readMainEnv(mainDir).databaseUrl, databaseName);
  console.log(`Base ${databaseName} supprimée (si elle existait).`);

  if (branch) deleteBranch(mainDir, branch);
}

async function main(argv: string[]): Promise<void> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      base: { type: 'string' },
      branch: { type: 'string' },
      empty: { type: 'boolean', default: false },
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
      branch: values.branch ?? `feat/${name}`,
      empty: values.empty,
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
