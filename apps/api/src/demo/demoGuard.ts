const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * Why the demo data must not be written to this database, or null when it may. Demo data replaces
 * projects: it is refused in production and, unless explicitly allowed, on any non-local host.
 */
export function demoDatabaseRefusal(
  target: { databaseUrl: string; nodeEnv: string }, options: { allowRemote: boolean },
): string | null {
  if (target.nodeEnv === 'production') return 'Demo data is for development databases only (NODE_ENV=production).';
  const host = new URL(target.databaseUrl).hostname;
  if (!options.allowRemote && !LOCAL_HOSTS.has(host)) {
    return `Refusing to write demo data to the remote database host "${host}". Pass --allow-remote to proceed.`;
  }
  return null;
}
