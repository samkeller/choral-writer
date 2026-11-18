import { vi } from 'vitest';
import type {
  ChatCompletion, ChatCompletionCreateParamsNonStreaming, ChatCompletionCreateParamsStreaming, ChatCompletionChunk,
} from 'openai/resources/chat/completions';

import { createCallLLM, type LlmCallTrace, type LlmUsageFact } from '../../llm/call-llm.js';
import type { ProviderStrategy } from '../../llm/providers/types.js';
import { readNumber, readObject, unavailableBalance } from '../../llm/providers/types.js';

/**
 * Support partagé des tests qui passent par la frontière `callLLM`.
 *
 * Le fournisseur de test lit les tokens standard sans prétendre tarifer : les
 * comportements propres à DeepSeek (cache, fenêtre pleine/creuse, solde) sont
 * vérifiés directement sur sa stratégie, dans `providers.test.ts`.
 */
export const testProvider: ProviderStrategy = {
  name: 'deepseek',
  extractUsage(raw: unknown) {
    const usage = readObject(readObject(raw)?.usage);
    if (!usage) return { inputTokens: null, outputTokens: null, cachedInputTokens: null };
    return {
      inputTokens: readNumber(usage.prompt_tokens),
      outputTokens: readNumber(usage.completion_tokens),
      cachedInputTokens: null,
    };
  },
  providerCostUsd: () => null,
  priceWindow: () => 'all',
  balance: async () => unavailableBalance('deepseek', 'Le solde n’est pas interrogé en test.'),
};

export interface TestCallLLMOptions {
  create: (
    params: ChatCompletionCreateParamsNonStreaming | ChatCompletionCreateParamsStreaming,
    options?: { signal?: AbortSignal },
  ) => Promise<ChatCompletion | AsyncIterable<ChatCompletionChunk>>;
  model?: string;
  now?: () => number;
  /** Collecte les traces pour assertion, sans base de données. */
  onTrace?: (trace: LlmCallTrace) => void;
  /** Active le registre d'usage et collecte les faits pour assertion. */
  collectUsage?: boolean;
  /** Remplace la stratégie fournisseur, pour tester un cas de cache ou de coût. */
  provider?: ProviderStrategy;
}

export function createTestCallLLM({
  create, model = 'test-model', now, onTrace, collectUsage = false, provider = testProvider,
}: TestCallLLMOptions) {
  const traces: LlmCallTrace[] = [];
  const usages: LlmUsageFact[] = [];
  const insert = vi.fn<(trace: LlmCallTrace) => Promise<void>>()
    .mockImplementation(async (trace) => { traces.push(trace); onTrace?.(trace); });
  const callLLM = createCallLLM({
    client: { chat: { completions: { create } } },
    traces: { insert },
    model,
    provider,
    ...(now ? { now } : {}),
    ...(collectUsage ? { usage: { record: async (fact: LlmUsageFact) => { usages.push(fact); } } } : {}),
  });
  return { callLLM, insert, traces, usages };
}

/**
 * Attend les écritures du registre, qui sont volontairement déclenchées sans être
 * attendues par `callLLM` : un échec comptable ne doit pas affecter le récit.
 */
export async function flushUsage(): Promise<void> {
  await new Promise((resolve) => { setImmediate(resolve); });
}
