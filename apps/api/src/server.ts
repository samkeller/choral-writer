import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { db, pool } from './db/client.js';
import { callLLM } from './llm/index.js';
import { ProjectsService } from './modules/projects/service.js';
import { createChatBranchService, createChatService } from './modules/chat/index.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const projects = new ProjectsService(db, createChatBranchService);
  const app = buildApp(config, {
    projects,
    chat: createChatService(db, projects, callLLM),
  });

  try {
    await pool.query('select 1');
    await app.listen({ host: '0.0.0.0', port: config.port });
  } catch (error) {
    app.log.error(error, 'Could not start the API server.');
    await app.close();
    await pool.end();
    throw error;
  }

  const shutdown = async (): Promise<void> => {
    await app.close();
    await pool.end();
  };

  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
