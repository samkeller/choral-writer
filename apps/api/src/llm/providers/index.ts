import type { LlmProvider } from '@choral-writer/shared';

import type { ProviderStrategy } from './types.js';
import { createDeepseekStrategy } from './deepseek.js';

export type { ProviderBalance, ProviderStrategy, ExtractedUsage } from './types.js';
export { readNumber, readObject, unavailableBalance } from './types.js';
export { detectProvider, resolveProvider } from './detect.js';
export { offPeakHours } from './deepseek.js';

/**
 * Sélection de la stratégie fournisseur.
 *
 * Toute la connaissance des différences entre fournisseurs est confinée ici ;
 * `call-llm.ts` ne manipule que le résultat normalisé. Ajouter un fournisseur
 * consiste à enregistrer une stratégie, sans condition dispersée ailleurs.
 *
 * Un fournisseur non pris en charge échoue au démarrage : mieux vaut un refus
 * explicite qu'une comptabilité silencieusement fausse.
 */
export function createProviderStrategy(
  provider: LlmProvider,
  config: { apiKey: string; baseUrl: string },
): ProviderStrategy {
  switch (provider) {
    case 'deepseek':
      return createDeepseekStrategy(config);
    default:
      throw new Error(`Unsupported LLM provider: ${String(provider)}`);
  }
}
