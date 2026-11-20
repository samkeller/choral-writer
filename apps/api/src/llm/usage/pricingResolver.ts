import type { CostBasis, PriceWindow } from '@choral-writer/shared';

/** Grille applicable à un appel, en dollars par million de tokens. */
export interface PriceRate {
  id: string;
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion: number | null;
}

export interface ResolvedCost {
  basis: CostBasis;
  costMicroUsd: number | null;
  pricingId: string | null;
}

export interface CostInput {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  providerCostUsd: number | null;
  rate: PriceRate | null;
}

const MICRO = 1_000_000;

/** Conversion en micro-dollars entiers : sommes exactes en base, sans flottant. */
export function toMicroUsd(usd: number): number {
  return Math.round(usd * MICRO);
}

/**
 * Résolution du coût d'un appel.
 *
 * Ordre de priorité : un coût renvoyé par le fournisseur est confirmé ; sinon une grille
 * connue permet de calculer ; sinon le coût reste inconnu. Aucune estimation n'est produite
 * ici — une estimation ne doit jamais être présentée comme un coût réel.
 */
export function resolveCost(input: CostInput): ResolvedCost {
  if (input.providerCostUsd !== null && Number.isFinite(input.providerCostUsd) && input.providerCostUsd >= 0) {
    return { basis: 'provider_confirmed', costMicroUsd: toMicroUsd(input.providerCostUsd), pricingId: null };
  }
  if (!input.rate || input.inputTokens === null || input.outputTokens === null) {
    return { basis: 'unpriced', costMicroUsd: null, pricingId: null };
  }
  const cacheRate = input.rate.cacheReadPerMillion;
  // Sans tarif de cache connu, les tokens d'entrée restent facturés au tarif plein :
  // surestimer légèrement vaut mieux qu'appliquer un prix de cache non vérifié.
  const cachedTokens = cacheRate === null ? 0 : Math.min(input.cachedInputTokens ?? 0, input.inputTokens);
  const fullPriceTokens = input.inputTokens - cachedTokens;
  const usd = (fullPriceTokens * input.rate.inputPerMillion
    + cachedTokens * (cacheRate ?? 0)
    + input.outputTokens * input.rate.outputPerMillion) / MICRO;
  return { basis: 'priced', costMicroUsd: toMicroUsd(usd), pricingId: input.rate.id };
}

export interface DatedRate {
  id: string;
  validFrom: Date;
  validTo: Date | null;
}

/**
 * Sélectionne la période de validité applicable.
 *
 * En cas de chevauchement, la période la plus récemment ouverte l'emporte : une
 * nouvelle grille prend effet même si l'ancienne n'a pas été explicitement close.
 */
export function selectRate<P extends DatedRate>(
  rates: readonly P[],
  at: Date,
  toRate: (row: P) => PriceRate,
): PriceRate | null {
  let selected: P | null = null;
  for (const rate of rates) {
    if (rate.validFrom.getTime() > at.getTime()) continue;
    if (rate.validTo !== null && rate.validTo.getTime() <= at.getTime()) continue;
    if (!selected || rate.validFrom.getTime() >= selected.validFrom.getTime()) selected = rate;
  }
  return selected ? toRate(selected) : null;
}

export function parseWindow(value: string): PriceWindow {
  return value === 'peak' || value === 'off_peak' ? value : 'all';
}
