import OpenAI from 'openai';

import { loadConfig } from '../config.js';

const config = loadConfig();

export const openai = new OpenAI({
  apiKey: config.llmApiKey,
  baseURL: config.llmBaseUrl,
  timeout: 120_000,
  maxRetries: 0,
});
