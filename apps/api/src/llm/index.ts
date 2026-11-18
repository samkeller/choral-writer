import { openai } from './client.js';
import { createCallLLM } from './call-llm.js';
import { insertLlmCall } from '../db/repositories/llmCallRepository.js';
import { configuredProvider, loadConfig } from '../config.js';
import { createProviderStrategy } from './providers/index.js';
import { createUsageService } from './usage/usageService.js';
import { db } from '../db/client.js';

const config = loadConfig();

export const provider = createProviderStrategy(configuredProvider(config), {
  apiKey: config.llmApiKey,
  baseUrl: config.llmBaseUrl,
});

export const usage = createUsageService(db);

export const callLLM = createCallLLM({
  client: openai,
  traces: { insert: insertLlmCall },
  model: config.llmModel,
  apiKey: config.llmApiKey,
  provider,
  usage,
});
