import { eq, sql } from 'drizzle-orm';
import type { LlmStage, PriceWindow } from '@choral-writer/shared';

import type { Database, Transaction } from '../../db/client.js';
import { llmPrice } from '../../db/entities/llmPrice.js';
import { llmUsage, type NewLlmUsage } from '../../db/entities/llmUsage.js';
import { parseWindow, type PriceRate } from './pricingResolver.js';

/** Fait normalisé produit par la frontière fournisseur, avant toute tarification. */
export interface LlmUsageFact {
  callId: string;
  projectId: string;
  turnId: string | null;
  stage: LlmStage;
  stageExecutionId: string | null;
  agentId: string | null;
  agentVersionId: string | null;
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  /** Coût renvoyé par le fournisseur lui-même, s'il en expose un. */
  providerCostUsd: number | null;
  durationMs: number;
  status: 'success' | 'error';
  at: Date;
  priceWindow: PriceWindow;
}

export class UsageRepository {
  constructor(private readonly database: Database | Transaction) {}

  /**
   * Toutes les périodes publiées pour un couple (fournisseur, modèle).
   *
   * Le filtrage temporel est délibérément laissé à `selectRate` : une grille est
   * sélectionnée à l'horodatage de l'appel, jamais à l'horloge du serveur, ce qui
   * rend la résolution testable sur une date arbitraire.
   */
  async ratesFor(provider: string, model: string) {
    const rows = await this.database.select({
      id: llmPrice.id,
      priceWindow: llmPrice.priceWindow,
      inputPerMillion: llmPrice.inputPerMillion,
      outputPerMillion: llmPrice.outputPerMillion,
      cacheReadPerMillion: llmPrice.cacheReadPerMillion,
      validFrom: llmPrice.validFrom,
      validTo: llmPrice.validTo,
    }).from(llmPrice).where(sql`${llmPrice.provider} = ${provider} and ${llmPrice.model} = ${model}`);
    return rows.map((row) => ({ ...row, priceWindow: parseWindow(row.priceWindow) }));
  }

  /** Insertion idempotente : `call_id` étant unique, une reconstruction ne crée jamais de doublon. */
  async insert(usage: NewLlmUsage): Promise<void> {
    await this.database.insert(llmUsage).values(usage).onConflictDoNothing({ target: llmUsage.callId });
  }

  async countForTurn(turnId: string): Promise<number> {
    const [row] = await this.database.select({ count: sql<number>`count(*)::int` })
      .from(llmUsage).where(eq(llmUsage.turnId, turnId));
    return row?.count ?? 0;
  }
}

export type PriceRateRow = Awaited<ReturnType<UsageRepository['ratesFor']>>[number];

/** Convertit une ligne de grille en taux exploitable, en ignorant les colonnes non tarifaires. */
export function toPriceRate(row: PriceRateRow): PriceRate {
  return {
    id: row.id,
    inputPerMillion: Number(row.inputPerMillion),
    outputPerMillion: Number(row.outputPerMillion),
    cacheReadPerMillion: row.cacheReadPerMillion === null ? null : Number(row.cacheReadPerMillion),
  };
}
