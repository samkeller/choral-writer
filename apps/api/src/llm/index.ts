import { openai } from './client.js';
import { createCallLLM } from './call-llm.js';
import { insertLlmCall } from '../db/repositories/llmCallRepository.js';
import { loadConfig } from '../config.js';

const config = loadConfig();

export const callLLM = createCallLLM({
  client: openai,
  traces: { insert: insertLlmCall },
  model: config.llmModel,
});
