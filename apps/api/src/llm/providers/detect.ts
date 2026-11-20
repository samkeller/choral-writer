import { llmProviderSchema, type LlmProvider } from '@choral-writer/shared';

/**
 * Déduit le fournisseur de l'hôte de l'API.
 *
 * `LLM_BASE_URL` reste libre, mais seul un hôte reconnu donne accès à la
 * tarification et au solde : un hôte inconnu est refusé plutôt que traité
 * comme un fournisseur générique dont la comptabilité serait fausse.
 */
export function detectProvider(baseUrl: string): LlmProvider | null {
  let host: string;
  try {
    host = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host === 'api.deepseek.com' || host.endsWith('.deepseek.com')) return 'deepseek';
  return null;
}

/** La configuration explicite l'emporte ; l'hôte ne sert que de repli documenté. */
export function resolveProvider(configured: string | undefined, baseUrl: string): LlmProvider {
  if (configured !== undefined && configured.trim() !== '') {
    return llmProviderSchema.parse(configured.trim().toLowerCase());
  }
  const detected = detectProvider(baseUrl);
  if (detected === null) {
    throw new Error(
      `Unable to determine the LLM provider from LLM_BASE_URL (${baseUrl}). Set LLM_PROVIDER explicitly.`,
    );
  }
  return detected;
}
