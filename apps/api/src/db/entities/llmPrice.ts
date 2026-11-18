import { index, numeric, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { priceWindowSchema } from '@choral-writer/shared';

import { choralWriterSchema } from '../namespace.js';

/**
 * Grille tarifaire historisée et immuable.
 *
 * Chaque ligne est une période de validité pour un couple (fournisseur, modèle, fenêtre).
 * Une ligne publiée n'est jamais modifiée : un changement de tarif insère une nouvelle
 * période et clôt la précédente. C'est ce qui permet à un coût ancien de rester
 * explicable sans jamais être recalculé avec les tarifs du jour.
 *
 * `priceWindow` porte la variation horaire du fournisseur : ignorer cette dimension
 * produirait un écart silencieux d'un facteur deux sur DeepSeek.
 */
export const llmPrice = choralWriterSchema.table('llm_price', {
  id: uuid('id').primaryKey(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  priceWindow: text('price_window', { enum: priceWindowSchema.options }).notNull().default('all'),
  inputPerMillion: numeric('input_per_million', { precision: 18, scale: 6 }).notNull(),
  outputPerMillion: numeric('output_per_million', { precision: 18, scale: 6 }).notNull(),
  cacheReadPerMillion: numeric('cache_read_per_million', { precision: 18, scale: 6 }),
  validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
  validTo: timestamp('valid_to', { withTimezone: true }),
  /** Provenance de la grille : documentation fournisseur, saisie manuelle ou API. */
  source: text('source').notNull(),
}, (table) => [
  index('llm_price_lookup_idx').on(table.provider, table.model, table.priceWindow, table.validFrom),
]);

export type LlmPriceRow = typeof llmPrice.$inferSelect;
export type NewLlmPrice = typeof llmPrice.$inferInsert;
