import { v7 as uuidv7 } from 'uuid';

import type { Database, Transaction } from '../../db/client.js';
import type { NewLlmUsage } from '../../db/entities/llmUsage.js';
import { resolveCost, selectRate } from './pricingResolver.js';
import { toPriceRate, UsageRepository, type LlmUsageFact } from './usageRepository.js';

/**
 * Responsabilité unique : transformer un fait d'usage en ligne de registre tarifée.
 *
 * C'est le seul endroit où un montant est calculé. Le coût est résolu à l'instant de
 * l'appel et figé avec la grille utilisée : il n'est jamais recalculé a posteriori
 * avec les tarifs du jour.
 */
export class UsageService {
  constructor(private readonly database: Database) {}

  async record(fact: LlmUsageFact): Promise<void> {
    const repository = new UsageRepository(this.database);
    const rate = fact.providerCostUsd === null
      ? selectRate(
        (await repository.ratesFor(fact.provider, fact.model))
          .filter((row) => row.priceWindow === fact.priceWindow || row.priceWindow === 'all'),
        fact.at,
        toPriceRate,
      )
      : null;

    const cost = resolveCost({
      inputTokens: fact.inputTokens,
      outputTokens: fact.outputTokens,
      cachedInputTokens: fact.cachedInputTokens,
      providerCostUsd: fact.providerCostUsd,
      rate,
    });

    const usage: NewLlmUsage = {
      id: uuidv7(),
      callId: fact.callId,
      projectId: fact.projectId,
      turnId: fact.turnId,
      stage: fact.stage,
      stageExecutionId: fact.stageExecutionId,
      agentId: fact.agentId,
      agentVersionId: fact.agentVersionId,
      provider: fact.provider,
      model: fact.model,
      inputTokens: fact.inputTokens,
      outputTokens: fact.outputTokens,
      cachedInputTokens: fact.cachedInputTokens,
      durationMs: fact.durationMs,
      status: fact.status,
      pricingId: cost.pricingId,
      costBasis: cost.basis,
      costMicroUsd: cost.costMicroUsd,
    };
    await repository.insert(usage);
  }
}

/** Signature minimale attendue par la frontière fournisseur, sans coupler `call-llm` au service. */
export type UsageRecorder = { record(fact: LlmUsageFact): Promise<void> };

export function createUsageService(database: Database): UsageService {
  return new UsageService(database);
}

export type { UsageRecorder as LlmUsageRecorder };
export type { LlmUsageFact };
export type UsageDatabase = Database | Transaction;
