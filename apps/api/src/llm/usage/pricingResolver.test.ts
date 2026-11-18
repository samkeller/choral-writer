import { describe, expect, it } from 'vitest';

import { resolveCost, selectRate, toMicroUsd, type PriceRate } from './pricingResolver.js';

const rate = (overrides: Partial<PriceRate> = {}): PriceRate => ({
  id: 'rate-1',
  inputPerMillion: 0.15,
  outputPerMillion: 0.6,
  cacheReadPerMillion: 0.003,
  ...overrides,
});

describe('resolveCost', () => {
  it('prefers a cost confirmed by the provider over any computed amount', () => {
    const cost = resolveCost({
      inputTokens: 1_000_000, outputTokens: 1_000_000, cachedInputTokens: 0,
      providerCostUsd: 0.5, rate: rate(),
    });

    // Le fournisseur est seul juge de ce qu'il a facturé : aucun calcul ne doit le remplacer.
    expect(cost).toEqual({ basis: 'provider_confirmed', costMicroUsd: 500_000, pricingId: null });
  });

  it('leaves the cost unmeasured when no price grid is known', () => {
    const cost = resolveCost({
      inputTokens: 1_000, outputTokens: 100, cachedInputTokens: null, providerCostUsd: null, rate: null,
    });

    expect(cost).toEqual({ basis: 'unpriced', costMicroUsd: null, pricingId: null });
  });

  it('leaves the cost unmeasured when token counts are missing', () => {
    const cost = resolveCost({
      inputTokens: null, outputTokens: 10, cachedInputTokens: null, providerCostUsd: null, rate: rate(),
    });

    // Un coût non mesuré ne doit jamais devenir un zéro présenté comme un prix réel.
    expect(cost.basis).toBe('unpriced');
    expect(cost.costMicroUsd).toBeNull();
  });

  it('computes a priced cost from the grid, keeping the resolved grid id', () => {
    const cost = resolveCost({
      inputTokens: 1_000_000, outputTokens: 1_000_000, cachedInputTokens: 0,
      providerCostUsd: null, rate: rate(),
    });

    expect(cost).toEqual({ basis: 'priced', costMicroUsd: toMicroUsd(0.75), pricingId: 'rate-1' });
  });

  it('bills cached input at the cache rate, which is the dominant cost lever', () => {
    const full = resolveCost({
      inputTokens: 1_000_000, outputTokens: 0, cachedInputTokens: 0, providerCostUsd: null, rate: rate(),
    });
    const cached = resolveCost({
      inputTokens: 1_000_000, outputTokens: 0, cachedInputTokens: 1_000_000, providerCostUsd: null, rate: rate(),
    });

    expect(full.costMicroUsd).toBe(toMicroUsd(0.15));
    expect(cached.costMicroUsd).toBe(toMicroUsd(0.003));
  });

  it('bills input at the full rate when no cache rate is published', () => {
    const cost = resolveCost({
      inputTokens: 1_000_000, outputTokens: 0, cachedInputTokens: 900_000,
      providerCostUsd: null, rate: rate({ cacheReadPerMillion: null }),
    });

    // Sans tarif de cache vérifié, surestimer vaut mieux qu'inventer un prix de cache.
    expect(cost.costMicroUsd).toBe(toMicroUsd(0.15));
  });

  it('never bills more cached tokens than input tokens', () => {
    const cost = resolveCost({
      inputTokens: 1_000_000, outputTokens: 0, cachedInputTokens: 2_000_000,
      providerCostUsd: null, rate: rate(),
    });

    // Le cache ne peut pas dépasser l'entrée : sans plafonnement, la facture doublerait.
    expect(cost.costMicroUsd).toBe(toMicroUsd(0.003));
  });
});

describe('selectRate', () => {
  it('selects the period whose validity covers the instant of the call', () => {
    const rows = [
      { id: 'old', validFrom: new Date('2026-01-01T00:00:00Z'), validTo: new Date('2026-06-01T00:00:00Z') },
      { id: 'new', validFrom: new Date('2026-06-01T00:00:00Z'), validTo: null },
    ];

    const selected = selectRate(rows, new Date('2026-03-01T00:00:00Z'), (row) => rate({ id: row.id }));

    expect(selected?.id).toBe('old');
  });

  it('never selects a period that starts after the call', () => {
    const rows = [
      { id: 'future', validFrom: new Date('2027-01-01T00:00:00Z'), validTo: null },
    ];

    expect(selectRate(rows, new Date('2026-03-01T00:00:00Z'), (row) => rate({ id: row.id }))).toBeNull();
  });

  it('prefers the most recently opened period when validity overlaps', () => {
    const rows = [
      { id: 'old', validFrom: new Date('2026-11-01T00:00:00Z'), validTo: null },
      { id: 'new', validFrom: new Date('2026-11-10T00:00:00Z'), validTo: null },
    ];

    // Une nouvelle grille prend effet même si l'ancienne n'a pas été explicitement close.
    const selected = selectRate(rows, new Date('2026-11-18T00:00:00Z'), (row) => rate({ id: row.id }));

    expect(selected?.id).toBe('new');
  });

  it('treats a closed period as no longer applicable once it ends', () => {
    const rows = [
      { id: 'closed', validFrom: new Date('2026-01-01T00:00:00Z'), validTo: new Date('2026-01-02T00:00:00Z') },
    ];

    expect(selectRate(rows, new Date('2026-01-02T00:00:00Z'), (row) => rate({ id: row.id }))).toBeNull();
  });
});
