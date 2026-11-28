import { z } from 'zod';

/**
 * Fournisseurs dont Choral Writer sait lire la consommation et le solde.
 *
 * La liste est volontairement fermée : un fournisseur non listé doit échouer
 * bruyamment plutôt que produire une comptabilité silencieusement fausse.
 */
export const llmProviderSchema = z.enum(['deepseek']);
export type LlmProvider = z.infer<typeof llmProviderSchema>;

/**
 * Étapes capables d'émettre un appel LLM, `reducer` exclu.
 *
 * Volontairement distinct de `traceStageSchema` : `reducer` ne consomme aucun token
 * et ne doit jamais apparaître comme une phase facturable. `attribution` est un outil du mode Debug,
 * calculé à la demande après le tour : facturé, mais jamais compté dans le coût du tour.
 */
export const llmStageSchema = z.enum(['analysis', 'direction', 'narrator', 'guardian', 'memory_setup', 'attribution']);
export type LlmStage = z.infer<typeof llmStageSchema>;

/**
 * Origine d'un montant. `provider_confirmed` n'est possible que si le fournisseur
 * renvoie lui-même un coût ; une estimation n'est jamais présentée comme un coût réel.
 */
export const costBasisSchema = z.enum(['provider_confirmed', 'priced', 'unpriced']);
export type CostBasis = z.infer<typeof costBasisSchema>;

/** Fenêtre tarifaire du fournisseur. `all` signifie qu'aucune variation horaire ne s'applique. */
export const priceWindowSchema = z.enum(['peak', 'off_peak', 'all']);
export type PriceWindow = z.infer<typeof priceWindowSchema>;

/** Statut de l'appel enregistré, aligné sur `llm_call.status`. */
export const usageStatusSchema = z.enum(['success', 'error']);
export type UsageStatus = z.infer<typeof usageStatusSchema>;

/**
 * Bornes de sécurité à l'ingestion. Une valeur hors bornes est une anomalie de contrat
 * fournisseur, pas une consommation plausible : elle est enregistrée comme non mesurée
 * plutôt que de risquer un dépassement d'entier.
 */
export const usageTokenLimit = 100_000_000;

export function isPlausibleTokens(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= usageTokenLimit;
}
