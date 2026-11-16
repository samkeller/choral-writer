import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import { v7 as uuidv7 } from 'uuid';
import type { z } from 'zod';

export interface CallLLMInput<T = unknown> {
  turnId?: string;
  agentId?: string;
  stage: string;
  messages: ChatCompletionMessageParam[];
  schema?: z.ZodType<T>;
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
      create(params: ChatCompletionCreateParamsNonStreaming): Promise<ChatCompletion>;
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
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createCallLLM({ client, traces, model, now = Date.now }: CallLLMDependencies) {
  return async function callLLM<T = unknown>(input: CallLLMInput<T>): Promise<LLMResult<T>> {
    const callId = uuidv7();
    const startedAt = now();
    let response: ChatCompletion | null = null;
    let content: string | null = null;
    let parsed: T | undefined;

    try {
      response = await client.chat.completions.create({
        model,
        messages: input.messages,
        stream: false,
        ...(input.schema ? { response_format: { type: 'json_object' } } : {}),
      });

      content = response.choices[0]?.message.content ?? null;
      if (content === null) {
        throw new Error('The LLM returned no message content.');
      }

      if (input.schema) {
        parsed = input.schema.parse(JSON.parse(content));
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
        inputTokens: response?.usage?.prompt_tokens ?? null,
        outputTokens: response?.usage?.completion_tokens ?? null,
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
      throw error;
    }

    if (response === null || content === null) {
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
      inputTokens: response.usage?.prompt_tokens ?? null,
      outputTokens: response.usage?.completion_tokens ?? null,
      durationMs,
      status: 'success',
      error: null,
    });

    return {
      callId,
      content,
      ...(input.schema ? { parsed } : {}),
      inputTokens: response.usage?.prompt_tokens ?? null,
      outputTokens: response.usage?.completion_tokens ?? null,
      durationMs,
    };
  };
}
