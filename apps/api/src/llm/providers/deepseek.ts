import { z } from 'zod';

import type { ExtractedUsage, ProviderBalance, ProviderStrategy } from './types.js';
import { readNumber, readObject, unavailableBalance } from './types.js';

const BALANCE_TIMEOUT_MS = 10_000;

/**
 * DeepSeek ne renvoie aucun coût monétaire et n'expose aucun historique de dépense :
 * `GET /user/balance` donne un instantané du solde, jamais une consommation par requête.
 * La fenêtre tarifaire pleine/creuse est donc indispensable pour calculer un coût exact.
 */
export function createDeepseekStrategy(
  config: { apiKey: string; baseUrl: string },
): ProviderStrategy {
  return {
    name: 'deepseek',
    extractUsage(raw: unknown): ExtractedUsage {
      const usage = readObject(readObject(raw)?.usage);
      if (!usage) return { inputTokens: null, outputTokens: null, cachedInputTokens: null };
      const details = readObject(usage.prompt_tokens_details);
      return {
        inputTokens: readNumber(usage.prompt_tokens),
        outputTokens: readNumber(usage.completion_tokens),
        // `prompt_cache_hit_tokens` est l'extension DeepSeek ; `prompt_tokens_details.cached_tokens`
        // porte la même information et sert de repli.
        cachedInputTokens: readNumber(usage.prompt_cache_hit_tokens)
          ?? readNumber(details?.cached_tokens),
      };
    },
    providerCostUsd: () => null,
    priceWindow: (at: Date) => offPeakHours(at) ? 'off_peak' : 'peak',
    balance: () => fetchBalance(config),
  };
}

/**
 * Heures pleines : 01:00–04:00 et 06:00–10:00 UTC, du lundi au vendredi.
 * Les jours fériés chinois sont également hors pointe, mais un calendrier férié
 * n'est pas embarqué : ces jours sont donc facturés au tarif pleine, soit une
 * surestimation bornée à ces dates.
 */
export function offPeakHours(at: Date): boolean {
  const day = at.getUTCDay();
  if (day === 0 || day === 6) return true;
  const hour = at.getUTCHours();
  const peak = (hour >= 1 && hour < 4) || (hour >= 6 && hour < 10);
  return !peak;
}

const balanceSchema = z.object({
  is_available: z.boolean().optional(),
  balance_infos: z.array(z.object({
    currency: z.string(),
    total_balance: z.string(),
    granted_balance: z.string().optional(),
    topped_up_balance: z.string().optional(),
  })).optional(),
});

async function fetchBalance(
  config: { apiKey: string; baseUrl: string },
): Promise<ProviderBalance> {
  const url = new URL('user/balance', config.baseUrl.endsWith('/') ? config.baseUrl : `${config.baseUrl}/`);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${config.apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(BALANCE_TIMEOUT_MS),
    });
  } catch {
    return unavailableBalance('deepseek', 'Le solde DeepSeek est momentanément indisponible.');
  }
  if (!response.ok) {
    return unavailableBalance('deepseek', `Le solde DeepSeek n’a pas pu être lu (${response.status}).`);
  }
  const parsed = balanceSchema.safeParse(await response.json().catch(() => null));
  const info = parsed.success ? parsed.data.balance_infos?.[0] : undefined;
  if (!info) return unavailableBalance('deepseek', 'Le solde DeepSeek est momentanément indisponible.');
  if (parsed.success && parsed.data.is_available === false) {
    return unavailableBalance('deepseek', 'Le solde DeepSeek est insuffisant pour poursuivre les appels.');
  }
  return {
    status: 'available',
    provider: 'deepseek',
    currency: info.currency,
    total: info.total_balance,
    ...(info.granted_balance ? { granted: info.granted_balance } : {}),
    ...(info.topped_up_balance ? { toppedUp: info.topped_up_balance } : {}),
  };
}
