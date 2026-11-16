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

import { ApiError } from '../errors.js';
import { normalizeLlmError } from './errors.js';

export interface CallLLMInput<T = unknown> {
  turnId?: string;
  agentId?: string;
  stage: string;
  messages: ChatCompletionMessageParam[];
  schema?: z.ZodType<T>;
  onDelta?: (delta: string) => void | Promise<void>;
  signal?: AbortSignal;
}

export interface LlmCallTrace {
  id: string;
  turnId: string | null;
  agentId: string | null;
  stage: string;
  model: string;
  messages: ChatCompletionMessageParam[];
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

interface CallLLMDependencies {
  client: LLMClient;
  traces: TraceRepository;
  model: string;
  now?: () => number;
  apiKey?: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createCallLLM({ client, traces, model, now = Date.now, apiKey }: CallLLMDependencies) {
  return async function callLLM<T = unknown>(input: CallLLMInput<T>): Promise<LLMResult<T>> {
    const callId = uuidv7();
    const startedAt = now();
    let response: ChatCompletion | null = null;
    let content: string | null = null;
    let parsed: T | undefined;
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    const timeout = AbortSignal.timeout(120_000);
    const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;

    try {
      const result = await client.chat.completions.create({
        model,
        messages: input.messages,
        stream: Boolean(input.onDelta),
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
          if (chunk.usage) {
            inputTokens = chunk.usage.prompt_tokens;
            outputTokens = chunk.usage.completion_tokens;
          }
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
        response = result;
        content = response.choices[0]?.message.content ?? null;
        inputTokens = response.usage?.prompt_tokens ?? null;
        outputTokens = response.usage?.completion_tokens ?? null;
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
      const trace: LlmCallTrace = {
        id: callId,
        turnId: input.turnId ?? null,
        agentId: input.agentId ?? null,
        stage: input.stage,
        model,
        messages: input.messages,
        response: content,
        inputTokens,
        outputTokens,
        durationMs: Math.max(0, now() - startedAt),
        status: 'error',
        error: errorMessage(error),
      };

      try {
        await traces.insert(trace);
      } catch (traceError) {
        throw new AggregateError(
          [error, traceError],
          'The LLM call failed and its trace could not be saved.',
        );
      }
      throw normalizeLlmError(error, apiKey, signal);
    }

    if (content === null) {
      throw new Error('The LLM response was not available after completion.');
    }

    const durationMs = Math.max(0, now() - startedAt);
    await traces.insert({
      id: callId,
      turnId: input.turnId ?? null,
      agentId: input.agentId ?? null,
      stage: input.stage,
      model,
      messages: input.messages,
      response: content,
      inputTokens,
      outputTokens,
      durationMs,
      status: 'success',
      error: null,
    });

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
