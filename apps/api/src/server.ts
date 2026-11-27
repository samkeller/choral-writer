import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { db, pool } from './db/client.js';
import { callLLM } from './llm/index.js';
import { AgentsService } from './modules/agents/services/agentsService.js';
import { ProjectsService } from './modules/projects/services/projectServices.js';
import { VariantAdoptionService, createChatBranchService, createChatService } from './modules/chat/index.js';
import { createAttributionService, createTraceService } from './modules/traces/index.js';
import { MemoriesService } from './modules/memories/services/memoriesService.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const projects = new ProjectsService(db, createChatBranchService);
  const agents = new AgentsService(db, projects);
  const memories = new MemoriesService(db, projects, callLLM);
  const chat = createChatService(db, projects, callLLM, memories);
  const traces = createTraceService(db);
  const app = buildApp(config, {
    projects,
    agents,
    chat,
    traces,
    memories,
    attribution: createAttributionService(db, callLLM, traces),
    adoption: new VariantAdoptionService(projects),
  });

  try {
    await pool.query('select 1');
    await agents.ensureLibrary();
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
