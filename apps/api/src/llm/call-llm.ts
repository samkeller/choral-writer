import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionChunk,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import { APIError } from 'openai/error';
import { isPlausibleTokens, type LlmStage, type MemoryContext, type PriceWindow } from '@choral-writer/shared';

import { ApiError } from '../errors/errors.js';
import { normalizeLlmError } from '../errors/llmErrors.js';
import type { ProviderStrategy } from './providers/index.js';

export interface CallLLMInput<T = unknown> {
  /**
   * Obligatoire : sans lui, un appel ne peut être ni rattaché à un projet ni facturé.
   * Rendre ce champ requis rend l'oubli impossible à la compilation.
   */
  projectId: string;
  turnId?: string;
  agentId?: string;
  agentVersionId?: string;
  stageExecutionId?: string;
  stage: LlmStage;
  messages: ChatCompletionMessageParam[];
  memory?: MemoryContext;
  /**
   * L'entrée est volontairement `any` : la validation s'applique au résultat de
   * `JSON.parse`, et un schéma avec valeur par défaut a une entrée plus large que sa
   * sortie (`memoryProposalsSchema`). Typer l'entrée en `unknown` rejetterait ce cas légitime.
   */
  schema?: z.ZodType<T, z.ZodTypeDef, any>;
  /** Plafond de sortie : l'atteindre fait échouer l'appel (`LLM_INCOMPLETE_RESPONSE`) plutôt que tronquer en silence. */
  maxTokens?: number;
  onDelta?: (delta: string) => void | Promise<void>;
  signal?: AbortSignal;
}

export interface LlmCallTrace {
  id: string;
  projectId: string;
  turnId: string | null;
  agentId: string | null;
  agentVersionId: string | null;
  stageExecutionId?: string | null;
  stage: LlmStage;
  model: string;
  messages: ChatCompletionMessageParam[];
  memory?: MemoryContext;
  response: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
  status: 'success' | 'error';
  error: string | null;
}

export interface LLMResult<T> {
  callId: string;
  content: string;
  parsed?: T;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
}

/** Fait d'usage transmis au registre comptable, déjà normalisé par la stratégie fournisseur. */
export interface LlmUsageFact {
  callId: string;
  projectId: string;
  turnId: string | null;
  stage: LlmStage;
  stageExecutionId: string | null;
  agentId: string | null;
  agentVersionId: string | null;
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  providerCostUsd: number | null;
  durationMs: number;
  status: 'success' | 'error';
  at: Date;
  priceWindow: PriceWindow;
}

interface LLMClient {
  chat: {
    completions: {
      create(
        params: ChatCompletionCreateParamsNonStreaming | ChatCompletionCreateParamsStreaming,
        options?: { signal?: AbortSignal },
      ): Promise<ChatCompletion | AsyncIterable<ChatCompletionChunk>>;
    };
  };
}

interface TraceRepository {
  insert(trace: LlmCallTrace): Promise<void>;
}

/** Écrit le registre financier. Optionnel : la trace reste la source de vérité du débogage. */
export interface UsageRecorder {
  record(fact: LlmUsageFact): Promise<void>;
}

interface CallLLMDependencies {
  client: LLMClient;
  traces: TraceRepository;
  model: string;
  provider: ProviderStrategy;
  now?: () => number;
  apiKey?: string;
  usage?: UsageRecorder;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Un token non plausible est une anomalie de contrat fournisseur, pas une consommation réelle. */
function plausible(value: number | null): number | null {
  return value !== null && isPlausibleTokens(value) ? value : null;
}

/**
 * Frontière unique vers le fournisseur : complétion, streaming, validation et traces.
 * Un résultat n'est rendu qu'après l'écriture de sa trace ; une sortie partielle n'est
 * jamais un succès. L'orchestration métier et la politique de retry restent chez l'appelant.
 *
 * La comptabilité est écrite après la trace, sur un chemin distinct : un échec du registre
 * est journalisé mais jamais propagé, car il ne doit pas transformer une narration réussie
 * en échec utilisateur. La ligne manquante reste reconstructible depuis `llm_call`, qui
 * conserve les tokens, et l'unicité de `call_id` rend cette reconstruction idempotente.
 */
export function createCallLLM({
  client, traces, model, provider, now = Date.now, apiKey, usage,
}: CallLLMDependencies) {
  return async function callLLM<T = unknown>(input: CallLLMInput<T>): Promise<LLMResult<T>> {
    const callId = uuidv7();
    const startedAt = now();
    let content: string | null = null;
    let parsed: T | undefined;
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    let cachedInputTokens: number | null = null;
    let providerCostUsd: number | null = null;
    const timeout = AbortSignal.timeout(120_000);
    const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;

    /** Normalise la consommation via la stratégie fournisseur : aucune lecture directe de `usage`. */
    function applyUsage(raw: unknown): void {
      const extracted = provider.extractUsage(raw);
      inputTokens = extracted.inputTokens;
      outputTokens = extracted.outputTokens;
      cachedInputTokens = extracted.cachedInputTokens;
      providerCostUsd = provider.providerCostUsd(raw);
    }

    /**
     * Awaited so a turn's cost is complete when the turn ends. A bookkeeping failure is
     * logged but never fails the narration that was already produced.
     */
    async function recordUsage(status: 'success' | 'error', durationMs: number): Promise<void> {
      if (!usage) return;
      const at = new Date();
      const fact: LlmUsageFact = {
        callId,
        projectId: input.projectId,
        turnId: input.turnId ?? null,
        stage: input.stage,
        stageExecutionId: input.stageExecutionId ?? null,
        agentId: input.agentId ?? null,
        agentVersionId: input.agentVersionId ?? null,
        provider: provider.name,
        model,
        inputTokens: plausible(inputTokens),
        outputTokens: plausible(outputTokens),
        cachedInputTokens: plausible(cachedInputTokens),
        providerCostUsd,
        durationMs,
        status,
        at,
        priceWindow: provider.priceWindow(at),
      };
      try {
        await usage.record(fact);
      } catch (error) {
        console.error('Could not record LLM usage.', {
          callId, projectId: input.projectId, stage: input.stage, error: errorMessage(error),
        });
      }
    }

    try {
      const result = await client.chat.completions.create({
        model,
        messages: input.messages,
        stream: Boolean(input.onDelta),
        ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
        ...(input.onDelta ? { stream_options: { include_usage: true } } : {}),
        ...(input.schema ? { response_format: { type: 'json_object' } } : {}),
      }, { signal });

      if (Symbol.asyncIterator in result) {
        content = '';
        let finished = false;
        for await (const chunk of result) {
          signal.throwIfAborted();
          if ('error' in chunk && chunk.error) {
            throw new APIError(
              undefined,
              typeof chunk.error === 'object' ? chunk.error : undefined,
              typeof chunk.error === 'string' ? chunk.error : undefined,
              undefined,
            );
          }
          if (chunk.usage) applyUsage(chunk);
          const choice = chunk.choices[0];
          if (choice?.delta.content) {
            content += choice.delta.content;
            await input.onDelta?.(choice.delta.content);
          }
          if (choice?.finish_reason) {
            if (choice.finish_reason !== 'stop') {
              throw new ApiError(502, 'LLM_INCOMPLETE_RESPONSE', 'Le fournisseur LLM a interrompu la réponse avant sa fin.', {
                source: 'llm',
              });
            }
            finished = true;
          }
        }
        signal.throwIfAborted();
        if (!finished) {
          throw new ApiError(502, 'LLM_INCOMPLETE_RESPONSE', 'La connexion au fournisseur LLM a été interrompue avant la fin de la réponse.', {
            source: 'llm',
          });
        }
      } else {
        content = result.choices[0]?.message.content ?? null;
        applyUsage(result);
        if (result.choices[0]?.finish_reason !== 'stop') {
          throw new ApiError(502, 'LLM_INCOMPLETE_RESPONSE', 'Le fournisseur LLM a interrompu la réponse avant sa fin.', {
            source: 'llm',
          });
        }
      }
      if (!content?.trim()) {
        throw new ApiError(502, 'LLM_EMPTY_RESPONSE', 'Le fournisseur LLM a renvoyé une réponse vide.', { source: 'llm' });
      }

      if (input.schema) {
        try {
          parsed = input.schema.parse(JSON.parse(content));
        } catch (error) {
          if (!(error instanceof z.ZodError) && !(error instanceof SyntaxError)) throw error;
          throw new ApiError(502, 'LLM_INVALID_RESPONSE', 'Le fournisseur LLM a renvoyé une réponse au format invalide.', {
            source: 'llm', cause: error,
          });
        }
      }
    } catch (error) {
      const durationMs = Math.max(0, now() - startedAt);
      try {
        await traces.insert({
          id: callId,
          projectId: input.projectId,
          turnId: input.turnId ?? null,
          agentId: input.agentId ?? null,
          agentVersionId: input.agentVersionId ?? null,
          stageExecutionId: input.stageExecutionId ?? null,
          stage: input.stage,
          model,
          messages: input.messages,
          memory: input.memory,
          response: content,
          inputTokens,
          outputTokens,
          durationMs,
          status: 'error',
          error: errorMessage(error),
        });
      } catch (traceError) {
        throw new AggregateError(
          [error, traceError],
          'The LLM call failed and its trace could not be saved.',
        );
      }
      await recordUsage('error', durationMs);
      throw normalizeLlmError(error, apiKey, signal);
    }

    if (content === null) {
      throw new Error('The LLM response was not available after completion.');
    }

    const durationMs = Math.max(0, now() - startedAt);
    await traces.insert({
      id: callId,
      projectId: input.projectId,
      turnId: input.turnId ?? null,
      agentId: input.agentId ?? null,
      agentVersionId: input.agentVersionId ?? null,
      stageExecutionId: input.stageExecutionId ?? null,
      stage: input.stage,
      model,
      messages: input.messages,
      memory: input.memory,
      response: content,
      inputTokens,
      outputTokens,
      durationMs,
      status: 'success',
      error: null,
    });
    await recordUsage('success', durationMs);

    return {
      callId,
      content,
      ...(input.schema ? { parsed } : {}),
      inputTokens,
      outputTokens,
      durationMs,
    };
  };
}
