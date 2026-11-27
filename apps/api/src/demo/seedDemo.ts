import { loadConfig } from '../config.js';
import { db, pool } from '../db/client.js';
import { demoDatabaseRefusal } from './demoGuard.js';
import { clearDemoProjects, seedDemoProjects } from './demoSeed.js';

/**
 * `pnpm db:seed:demo` fills the local database of `.env` with the demo projects; `--clear` only removes them.
 * `--allow-remote` is required to target a database on another host.
 */
async function main(): Promise<void> {
  const refusal = demoDatabaseRefusal(loadConfig(), { allowRemote: process.argv.includes('--allow-remote') });
  if (refusal) throw new Error(refusal);
  if (process.argv.includes('--clear')) {
    await clearDemoProjects(db);
    console.log('Projets de démo supprimés.');
    return;
  }
  for (const project of await seedDemoProjects(db)) {
    console.log(`${project.name} : ${project.turns} tours — /projects/${project.id}`);
  }
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
