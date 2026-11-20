import { priceWindowSchema, type LlmProvider } from '@choral-writer/shared';

export { priceWindowSchema };
export type { LlmProvider };

/**
 * Contrat d'un fournisseur LLM : normalisation des tokens, capture d'un éventuel coût,
 * fenêtre tarifaire et lecture du solde. Chaque implémentation ne traduit que les
 * spécificités d'un fournisseur ; aucun calcul monétaire n'a lieu ici.
 */
export interface ProviderBalance {
  status: 'available' | 'unavailable';
  provider: LlmProvider;
  /** Renseigné uniquement lorsque `status` vaut `available`. */
  currency?: string;
  total?: string;
  granted?: string;
  toppedUp?: string;
  /** Motif lisible lorsque la lecture n'est pas possible. */
  reason?: string;
}

export interface ExtractedUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
}

export interface ProviderStrategy {
  readonly name: LlmProvider;
  /** Lit les tokens d'une réponse de complétion, y compris les champs de cache propres au fournisseur. */
  extractUsage(raw: unknown): ExtractedUsage;
  /** Coût renvoyé par le fournisseur lui-même, en USD. `null` s'il n'en expose pas. */
  providerCostUsd(raw: unknown): number | null;
  /** Fenêtre tarifaire en vigueur à cet instant. `all` si le fournisseur n'en a pas. */
  priceWindow(at: Date): 'peak' | 'off_peak' | 'all';
  balance(): Promise<ProviderBalance>;
}

export function readObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

/** Lecture défensive : le type SDK ne couvre ni les extensions DeepSeek ni le coût OpenRouter. */
export function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function unavailableBalance(provider: LlmProvider, reason: string): ProviderBalance {
  return { status: 'unavailable', provider, reason };
}
