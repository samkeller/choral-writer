import { type ChildProcess, spawn, spawnSync } from 'node:child_process';

interface RunOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

function describeCommand(command: string, args: readonly string[]): string {
  return [command, ...args].join(' ');
}

/** Exécute une commande en affichant sa sortie ; échoue si son code de sortie n'est pas nul. */
export function run(command: string, args: readonly string[], options: RunOptions): void {
  const result = spawnSync(command, args, { ...options, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Échec (${result.status}) : ${describeCommand(command, args)}`);
  }
}

/** Exécute une commande et renvoie sa sortie standard. */
export function capture(command: string, args: readonly string[], options: RunOptions): string {
  const result = spawnSync(command, args, { ...options, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Échec (${result.status}) : ${describeCommand(command, args)}\n${result.stderr.trim()}`,
    );
  }
  return result.stdout;
}

/** Vrai si la commande se termine avec le code 0, sans rien afficher. */
export function succeeds(command: string, args: readonly string[], options: RunOptions): boolean {
  const result = spawnSync(command, args, { ...options, stdio: 'ignore' });
  return !result.error && result.status === 0;
}

interface PipedCommand {
  command: string;
  args: readonly string[];
  env: NodeJS.ProcessEnv;
}

/** Relie la sortie de `source` à l'entrée de `sink`, comme `source | sink` dans un shell. */
export async function pipe(source: PipedCommand, sink: PipedCommand, cwd: string): Promise<void> {
  const producer = spawn(source.command, source.args, {
    cwd,
    env: source.env,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const consumer = spawn(sink.command, sink.args, {
    cwd,
    env: sink.env,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  producer.stdout.pipe(consumer.stdin);
  // Si `sink` s'arrête avant la fin, l'écriture échoue (EPIPE) : son code de sortie le signale déjà.
  consumer.stdin.on('error', () => undefined);

  const exitOf = (child: ChildProcess, label: string) =>
    new Promise<void>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code) =>
        code === 0 ? resolve() : reject(new Error(`Échec (${code}) : ${label}`)),
      );
    });

  await Promise.all([
    exitOf(producer, describeCommand(source.command, source.args)),
    exitOf(consumer, describeCommand(sink.command, sink.args)),
  ]);
}

/**
 * Lance pnpm sans shell, avec le binaire qui exécute ce script (`npm_execpath`),
 * ce qui évite les particularités de `pnpm.cmd` sous Windows.
 */
export function runPnpm(args: readonly string[], cwd: string): void {
  const pnpm = process.env.npm_execpath;
  if (!pnpm) {
    throw new Error('Lancer ce script par pnpm (`pnpm wt:new` ou `pnpm wt:remove`).');
  }
  if (/\.c?js$/.test(pnpm)) run(process.execPath, [pnpm, ...args], { cwd });
  else run(pnpm, args, { cwd });
}
