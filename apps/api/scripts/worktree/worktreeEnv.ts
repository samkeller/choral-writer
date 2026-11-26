const WORKTREE_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** PostgreSQL tronque les identifiants au-delà de 63 octets ; le préfixe en occupe 17. */
const WORKTREE_NAME_MAX_LENGTH = 40;

export const WORKTREE_DATABASE_PREFIX = 'choral_writer_wt_';

/** Premier port d'API proposé : `3001` reste celui du checkout principal par défaut. */
export const FIRST_WORKTREE_PORT = 3002;

export function assertWorktreeName(name: string): void {
  if (name.length > WORKTREE_NAME_MAX_LENGTH || !WORKTREE_NAME_PATTERN.test(name)) {
    throw new Error(
      `Nom de worktree invalide « ${name} » : minuscules, chiffres et tirets, ${WORKTREE_NAME_MAX_LENGTH} caractères au plus.`,
    );
  }
}

export function worktreeDatabaseName(name: string): string {
  assertWorktreeName(name);
  return `${WORKTREE_DATABASE_PREFIX}${name.replaceAll('-', '_')}`;
}

export function withDatabaseName(databaseUrl: string, databaseName: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

const ENV_LINE_PATTERN = /^(\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*)(["']?)(.*?)\3\s*$/;

interface EnvLine {
  prefix: string;
  key: string;
  quote: string;
  value: string;
}

function parseEnvLine(line: string): EnvLine | undefined {
  const match = ENV_LINE_PATTERN.exec(line);
  if (!match) return undefined;
  const [, prefix, key, quote, value] = match;
  return { prefix, key, quote, value };
}

export function readEnvValue(content: string, key: string): string | undefined {
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (parsed?.key === key) return parsed.value;
  }
  return undefined;
}

/**
 * Dérive le `.env` d'un worktree de celui du checkout principal : seuls le nom de base
 * de `DATABASE_URL` et `PORT` changent, les autres lignes (secrets compris) sont recopiées.
 */
export function deriveWorktreeEnv(
  content: string,
  target: { databaseName: string; port: number },
): string {
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  let hasDatabaseUrl = false;
  let hasPort = false;

  const lines = content.split(/\r?\n/).map((line) => {
    const parsed = parseEnvLine(line);
    if (parsed?.key === 'DATABASE_URL') {
      hasDatabaseUrl = true;
      const url = withDatabaseName(parsed.value, target.databaseName);
      return `${parsed.prefix}${parsed.quote}${url}${parsed.quote}`;
    }
    if (parsed?.key === 'PORT') {
      hasPort = true;
      return `${parsed.prefix}${target.port}`;
    }
    return line;
  });

  if (!hasDatabaseUrl) {
    throw new Error('DATABASE_URL est absente du .env du checkout principal.');
  }
  if (!hasPort) {
    const insertAt = lines.at(-1) === '' ? lines.length - 1 : lines.length;
    lines.splice(insertAt, 0, `PORT=${target.port}`);
  }
  return lines.join(eol);
}

/** Premier port à partir de `start` qui n'est pas déjà attribué à un autre checkout. */
export function nextUnreservedPort(reserved: ReadonlySet<number>, start: number): number {
  let port = start;
  while (reserved.has(port)) port += 1;
  if (port > 65535) throw new Error('Aucun port disponible.');
  return port;
}
