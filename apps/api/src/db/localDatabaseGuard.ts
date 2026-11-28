const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * Why a development script must not write `subject` (demo data, evaluation projects…) to this database,
 * or null when it may. Such scripts create or replace projects: they are refused in production and,
 * unless explicitly allowed, on any non-local host.
 */
export function localDatabaseRefusal(
  target: { databaseUrl: string; nodeEnv: string }, options: { allowRemote: boolean }, subject: string,
): string | null {
  if (target.nodeEnv === 'production') return `${subject} is for development databases only (NODE_ENV=production).`;
  const host = new URL(target.databaseUrl).hostname;
  if (!options.allowRemote && !LOCAL_HOSTS.has(host)) {
    return `Refusing to write ${subject.toLowerCase()} to the remote database host "${host}". Pass --allow-remote to proceed.`;
  }
  return null;
}
