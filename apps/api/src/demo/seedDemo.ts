import { loadConfig } from '../config.js';
import { db, pool } from '../db/client.js';
import { clearDemoProjects, seedDemoProjects } from './demoSeed.js';

/** `pnpm db:seed:demo` fills the database of `.env` with the demo projects; `--clear` only removes them. */
async function main(): Promise<void> {
  if (loadConfig().nodeEnv === 'production') {
    throw new Error('Demo data is for development databases only (NODE_ENV=production).');
  }
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
