import { bigint, index, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { costBasisSchema, llmStageSchema } from '@choral-writer/shared';

import { choralWriterSchema } from '../namespace.js';
import { projects } from './project.js';
import { llmCall } from './llmCall.js';
import { llmPrice } from './llmPrice.js';

/**
 * Registre financier : une ligne par appel LLM facturé.
 *
 * Séparé de `llm_call` parce que les deux ont des durées de vie différentes : `llm_call`
 * conserve prompts et réponses et devra être purgé, tandis qu'un coût doit rester
 * permanent et stable. Le registre ne dépend donc jamais de la politique de rétention
 * du journal de débogage.
 *
 * `projectId` est dénormalisé et obligatoire : `llm_call.turn_id` n'a aucune contrainte
 * de clé étrangère et les appels `memory_setup` n'ont pas de tour, si bien qu'une
 * jointure via `chat_turn` perdrait des appels réellement facturés.
 */
export const llmUsage = choralWriterSchema.table('llm_usage', {
  id: uuid('id').primaryKey(),
  /** Un appel donne au plus une ligne : l'unicité rend toute reconstruction idempotente. */
  callId: uuid('call_id').notNull().unique().references(() => llmCall.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  /** Nul pour un appel hors tour (`memory_setup`). Sans clé étrangère : un tour annulé ne doit pas effacer la dépense. */
  turnId: uuid('turn_id'),
  stage: text('stage', { enum: llmStageSchema.options }).notNull(),
  /** Relie les appels d'une même exécution mémoire à son `memory_run`. */
  stageExecutionId: uuid('stage_execution_id'),
  agentId: uuid('agent_id'),
  agentVersionId: uuid('agent_version_id'),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  inputTokens: bigint('input_tokens', { mode: 'number' }),
  outputTokens: bigint('output_tokens', { mode: 'number' }),
  cachedInputTokens: bigint('cached_input_tokens', { mode: 'number' }),
  durationMs: bigint('duration_ms', { mode: 'number' }).notNull(),
  status: text('status').notNull(),
  /** Grille appliquée au moment de l'appel ; nulle lorsque le fournisseur a confirmé le coût. */
  pricingId: uuid('pricing_id').references(() => llmPrice.id),
  costBasis: text('cost_basis', { enum: costBasisSchema.options }).notNull(),
  /** Montant en micro-dollars entiers : sommes exactes, aucun flottant. Nul si non mesuré. */
  costMicroUsd: bigint('cost_micro_usd', { mode: 'number' }),
  currency: text('currency').notNull().default('USD'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('llm_usage_project_created_idx').on(table.projectId, table.createdAt),
  index('llm_usage_project_stage_idx').on(table.projectId, table.stage),
  index('llm_usage_turn_idx').on(table.turnId),
  index('llm_usage_model_idx').on(table.model),
]);

export type LlmUsageRow = typeof llmUsage.$inferSelect;
export type NewLlmUsage = typeof llmUsage.$inferInsert;
