import type { TurnMetrics } from '@choral-writer/shared';

const decimal = (value: number, digits: number) => value.toFixed(digits).replace('.', ',');

export function formatSeconds(durationMs: number): string {
  const seconds = durationMs / 1000;
  return `${seconds < 10 ? decimal(seconds, 1) : Math.round(seconds)} s`;
}

/** A partial total is a lower bound: some calls of the turn have no known price. */
export function formatCost(cost: TurnMetrics['cost']): string {
  if (!cost.complete && cost.microUsd === 0) return 'coût inconnu';
  return `${cost.complete ? '' : '≥ '}${formatUsd(cost.microUsd)}`;
}

export function formatUsd(microUsd: number): string {
  const usd = microUsd / 1_000_000;
  return `${decimal(usd, usd < 0.01 ? 4 : 3)} $`;
}

export function formatTokens(tokens: number | null): string {
  if (tokens === null) return '—';
  return tokens >= 1000 ? `${decimal(tokens / 1000, 1)} k` : String(tokens);
}

export function formatDelta(value: number, reference: number): string {
  const delta = Math.round(((value - reference) / reference) * 100);
  return `${delta >= 0 ? '+' : ''}${delta} %`;
}
