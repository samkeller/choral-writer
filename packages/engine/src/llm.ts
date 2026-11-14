import { z, type ZodType } from 'zod';

export type Message = { role: 'system' | 'user' | 'assistant'; content: string };
export type CallTrace = {
  projectId: string;
  turnId?: string;
  agentId?: string;
  purpose: string;
  model: string;
  messages: Message[];
  response?: string;
  inputTokens?: number;
  cachedTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  latencyMs: number;
  status: 'succeeded' | 'failed';
  error?: string;
};

export type TraceWriter = (trace: CallTrace, reservationId?: string) => Promise<void>;
export type RequestReservation = (options: {
  projectId: string; turnId?: string; model: string; messages: Message[]; maxTokens: number;
}) => Promise<string | undefined>;
export class TracePersistenceError extends Error {
  constructor(cause: unknown) {
    super(`LLM trace could not be persisted: ${cause instanceof Error ? cause.message : 'unknown error'}`, { cause });
  }
}
export type CompleteOptions<T> = {
  projectId: string;
  turnId?: string;
  agentId?: string;
  purpose: string;
  model: string;
  messages: Message[];
  schema?: ZodType<T>;
  maxTokens: number;
  temperature?: number;
  timeoutMs?: number;
};

const responseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
  usage: z.object({
    prompt_tokens: z.number().optional(),
    completion_tokens: z.number().optional(),
    prompt_tokens_details: z.object({ cached_tokens: z.number().optional() }).optional(),
    cost: z.number().finite().nonnegative().optional()
  }).optional()
});

export class LlmClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly trace: TraceWriter,
    private readonly fetcher: typeof fetch = fetch,
    private readonly reserve?: RequestReservation
  ) {}

  private async saveTrace(trace: CallTrace, reservationId?: string): Promise<void> {
    try {
      await this.trace(trace, reservationId);
    } catch (error) {
      throw new TracePersistenceError(error);
    }
  }

  async complete<T = string>(options: CompleteOptions<T>): Promise<T> {
    let messages = [...options.messages];
    let repaired = false;
    for (;;) {
      const response = await this.requestWithRetry(options, messages);
      if (!options.schema) return response as T;
      try {
        return options.schema.parse(JSON.parse(response));
      } catch (error) {
        if (repaired) throw new Error('LLM response failed schema validation after repair', { cause: error });
        repaired = true;
        messages = [
          ...messages,
          { role: 'assistant', content: response },
          { role: 'user', content: 'La réponse précédente est invalide. Corrige-la et renvoie uniquement un JSON conforme au schéma demandé.' }
        ];
      }
    }
  }

  async stream(options: CompleteOptions<string>, onDelta: (delta: string) => void | Promise<void>, retryBeforeOutput = true): Promise<string> {
        let emitted = false;
        for (let attempt = 0; ; attempt++) {
          try {
            return await this.streamRequest(options, async delta => {
              emitted = true;
              await onDelta(delta);
            });
          } catch (error) {
            if (!retryBeforeOutput || !(error instanceof RetryableError) || emitted || attempt >= 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 250 * 2 ** attempt));
          }
        }
      }

      private async streamRequest(options: CompleteOptions<string>, onDelta: (delta: string) => void | Promise<void>): Promise<string> {
        const reservationId = await this.reserve?.(options);
        const started = Date.now();
        const trace: CallTrace = {
          projectId: options.projectId, turnId: options.turnId, agentId: options.agentId,
          purpose: options.purpose, model: options.model, messages: options.messages, latencyMs: 0, status: 'failed'
        };
        let text = '';
        try {
          const response = await this.fetcher(`${this.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
            body: JSON.stringify({ model: options.model, messages: options.messages, max_tokens: options.maxTokens,
              temperature: options.temperature, stream: true, stream_options: { include_usage: true } }),
            signal: AbortSignal.timeout(options.timeoutMs ?? 30_000)
          });
          if (!response.ok) {
            const message = `LLM provider returned HTTP ${response.status}`;
            if (response.status === 429 || response.status >= 500) throw new RetryableError(message);
            throw new Error(message);
          }
          if (!response.body) throw new Error('LLM streaming response has no body');
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let done = false;
          const consume = async (frame: string) => {
            const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:'))
              .map(line => line.slice(5).trimStart()).join('\n');
            if (!data) return;
            if (data === '[DONE]') { done = true; return; }
            const chunk = z.object({
              choices: z.array(z.object({ delta: z.object({ content: z.string().nullable().optional() }).optional() })),
              usage: responseSchema.shape.usage.nullable()
            }).parse(JSON.parse(data));
            if (chunk.usage) {
              trace.inputTokens = chunk.usage.prompt_tokens;
              trace.cachedTokens = chunk.usage.prompt_tokens_details?.cached_tokens;
              trace.outputTokens = chunk.usage.completion_tokens;
              trace.costUsd = chunk.usage.cost;
            }
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) { text += delta; await onDelta(delta); }
          };
          try {
            for (;;) {
              const part = await reader.read();
              buffer += decoder.decode(part.value, { stream: !part.done });
              let match: RegExpExecArray | null;
              while ((match = /\r?\n\r?\n/.exec(buffer))) {
                await consume(buffer.slice(0, match.index));
                buffer = buffer.slice(match.index + match[0].length);
              }
              if (part.done) break;
            }
            if (buffer.trim()) await consume(buffer);
            if (!done) throw new Error('LLM stream ended without completion marker');
          } finally {
            reader.releaseLock();
          }
          trace.response = text;
          trace.status = 'succeeded';
        } catch (error) {
          const failure = error instanceof Error ? error : new Error('Unknown LLM error');
          trace.response = text || undefined;
          trace.error = failure.message;
          trace.latencyMs = Date.now() - started;
          await this.saveTrace(trace, reservationId);
          if (failure.name === 'TimeoutError' || failure.name === 'AbortError' || failure instanceof TypeError) {
            throw new RetryableError('LLM request failed or timed out', { cause: failure });
          }
          throw failure;
        }
        trace.latencyMs = Date.now() - started;
        await this.saveTrace(trace, reservationId);
        return text;
      }

  private async requestWithRetry<T>(options: CompleteOptions<T>, messages: Message[]): Promise<string> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.request(options, messages);
      } catch (error) {
        if (!(error instanceof RetryableError) || attempt >= 1) throw error;
        await new Promise(resolve => setTimeout(resolve, 250 * 2 ** attempt));
      }
    }
  }

  private async request<T>(options: CompleteOptions<T>, messages: Message[]): Promise<string> {
    const reservationId = await this.reserve?.({ ...options, messages });
    const started = Date.now();
    const trace: CallTrace = {
      projectId: options.projectId, turnId: options.turnId, agentId: options.agentId,
      purpose: options.purpose, model: options.model, messages,
      latencyMs: 0, status: 'failed'
    };
    let result: string;
    try {
      const response = await this.fetcher(`${this.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: options.model, messages, max_tokens: options.maxTokens,
          temperature: options.temperature,
          ...(options.schema ? { response_format: { type: 'json_object' } } : {})
        }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 30_000)
      });
      if (!response.ok) {
        const message = `LLM provider returned HTTP ${response.status}`;
        if (response.status === 429 || response.status >= 500) throw new RetryableError(message);
        throw new Error(message);
      }
      const payload = responseSchema.parse(await response.json());
      result = payload.choices[0].message.content;
      trace.response = result;
      trace.inputTokens = payload.usage?.prompt_tokens;
      trace.cachedTokens = payload.usage?.prompt_tokens_details?.cached_tokens;
      trace.outputTokens = payload.usage?.completion_tokens;
      trace.costUsd = payload.usage?.cost;
      trace.status = 'succeeded';
    } catch (error) {
      const failure = error instanceof Error ? error : new Error('Unknown LLM error');
      trace.error = failure.message;
      trace.latencyMs = Date.now() - started;
      await this.saveTrace(trace, reservationId);
      if (failure.name === 'TimeoutError' || failure.name === 'AbortError' || failure instanceof TypeError) {
        throw new RetryableError('LLM request failed or timed out', { cause: failure });
      }
      throw failure;
    }
    trace.latencyMs = Date.now() - started;
    await this.saveTrace(trace, reservationId);
    return result;
  }
}

class RetryableError extends Error {}
