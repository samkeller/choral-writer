import { jsonb, pgSchema, text, timestamp, uuid, integer } from 'drizzle-orm/pg-core';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const pgChoralWriter = pgSchema('choral_writer');

export const llmCall = pgChoralWriter.table("llm_call",{
  id: uuid('id').primaryKey(),
  turnId: uuid('turn_id'),
  agentId: uuid('agent_id'),
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
});
