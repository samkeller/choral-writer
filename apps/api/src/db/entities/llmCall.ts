import { index, jsonb, text, timestamp, uuid, integer } from 'drizzle-orm/pg-core';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { choralWriterSchema } from '../namespace.js';

export const llmCall = choralWriterSchema.table("llm_call",{
  id: uuid('id').primaryKey(),
  turnId: uuid('turn_id'),
  agentId: uuid('agent_id'),
  agentVersionId: uuid('agent_version_id'),
  stage: text('stage').notNull(),
  model: text('model').notNull(),
  request: jsonb('request').$type<{ messages: ChatCompletionMessageParam[] }>().notNull(),
  response: text('response'),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  durationMs: integer('duration_ms').notNull(),
  status: text('status', { enum: ['success', 'error'] }).notNull(),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('llm_call_turn_stage_created_idx').on(table.turnId, table.stage, table.createdAt),
]);
