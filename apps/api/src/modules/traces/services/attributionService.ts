import type {
  AttributedItem, TurnAttribution, TurnAttributionRecord, TurnAttributionResponse, TurnTraceSummary,
} from '@choral-writer/shared';
import { contributionsToldToNarrator } from '@choral-writer/shared';

import { ApiError, notfoundError } from '../../../errors/errors.js';
import type { CallLLMInput, createCallLLM } from '../../../llm/call-llm.js';
import type { AttributionRepository } from '../repositories/attributionRepository.js';
import { type AttributionOutput, attributionOutputSchema, attributionRequest } from './attributionPrompt.js';

export interface ProseAttributionInput {
  projectId: string;
  /** The calls are traced, and billed, under this turn. */
  turnId: string;
  prose: string;
  /** What the Narrator received, in the order he read it. */
  contributions: readonly AttributedItem[];
}

/** An output the model may fix on a second try; any other failure is reported at once. */
const retriedCodes = ['LLM_INVALID_RESPONSE', 'LLM_EMPTY_RESPONSE'];

/**
 * Reads a turn's prose against the contributions its Narrator received, by a small non-streamed LLM call
 * traced under the `attribution` stage. The last attribution and the last failure are cached on the turn:
 * only an explicit regeneration pays again.
 */
export class AttributionService {
  /** One computation at a time per turn: a second request joins the one under way instead of paying twice. */
  private readonly pending = new Map<string, Promise<TurnAttributionRecord>>();

  constructor(
    private readonly callLLM: ReturnType<typeof createCallLLM>,
    private readonly repository: Pick<AttributionRepository, 'find' | 'save' | 'listCallCosts'>,
    private readonly summary: (projectId: string, turnId: string) => Promise<TurnTraceSummary>,
  ) {}

  /**
   * The cached record, computed on first request; `regenerate` recomputes it explicitly. A failure of the
   * model is part of the record, with the cost of what was tried, rather than an HTTP error.
   */
  async forTurn(projectId: string, turnId: string, { regenerate }: { regenerate: boolean }): Promise<TurnAttributionResponse> {
    const cached = await this.repository.find(projectId, turnId);
    if (cached === undefined) throw notfoundError('Ce tour est introuvable.');
    const record = cached && !regenerate ? cached : await this.compute(projectId, turnId, regenerate);
    const costs = await this.repository.listCallCosts(turnId);
    return {
      ...record,
      cost: {
        microUsd: costs.reduce((total, call) => total + (call.costMicroUsd ?? 0), 0),
        complete: costs.every((call) => call.costMicroUsd !== null),
        calls: costs.length,
      },
    };
  }

  /**
   * Reusable for any prose and contributions, such as variants of a turn compared side by side. Retries
   * once on an invalid output, as the Director does; any other failure is thrown.
   */
  async attributeProse({ projectId, turnId, prose, contributions }: ProseAttributionInput): Promise<TurnAttribution> {
    const request: CallLLMInput<AttributionOutput> = {
      projectId,
      turnId,
      stage: 'attribution',
      ...attributionRequest(prose, contributions),
      schema: attributionOutputSchema(contributions.length),
    };
    const result = await this.callLLM(request).catch((error: unknown) => {
      if (!(error instanceof ApiError) || !retriedCodes.includes(error.code)) throw error;
      return this.callLLM(request);
    });
    const output = result.parsed;
    if (!output) throw new Error('The attribution call returned no validated output.');
    const verdicts = new Map(output.contributions.map((contribution) => [contribution.id, contribution]));
    return {
      whatHappened: output.whatHappened,
      contributions: contributions.map((contribution, index) => {
        const verdict = verdicts.get(index + 1);
        if (!verdict) throw new Error('The attribution output misses a contribution.');
        return { ...contribution, verdict: verdict.verdict, note: verdict.note };
      }),
      callId: result.callId,
      createdAt: new Date().toISOString(),
    };
  }

  private compute(projectId: string, turnId: string, regenerate: boolean): Promise<TurnAttributionRecord> {
    const running = this.pending.get(turnId);
    if (running) return running;
    const computation = this.computeAndSave(projectId, turnId, regenerate).finally(() => this.pending.delete(turnId));
    this.pending.set(turnId, computation);
    return computation;
  }

  private async computeAndSave(projectId: string, turnId: string, regenerate: boolean): Promise<TurnAttributionRecord> {
    // A computation that finished between the caller's read and now has already paid for this turn.
    const cached = await this.repository.find(projectId, turnId);
    if (cached && !regenerate) return cached;
    const summary = await this.summary(projectId, turnId);
    const prose = summary.narrator?.prose;
    if (!prose) throw new ApiError(409, 'ATTRIBUTION_UNAVAILABLE', 'Ce tour n’a pas de prose à attribuer.');
    const whiteboard = summary.analysis.flatMap((agent) => agent.envelope ?? []);
    const record = await this.attributeProse({
      projectId, turnId, prose,
      contributions: contributionsToldToNarrator(whiteboard, summary.direction?.direction ?? null),
    }).then(
      (attribution): TurnAttributionRecord => ({ attribution, failure: null }),
      (error: unknown): TurnAttributionRecord => {
        if (!(error instanceof ApiError) || error.options.source !== 'llm') throw error;
        return {
          attribution: cached?.attribution ?? null,
          failure: { code: error.code, message: error.message, failedAt: new Date().toISOString() },
        };
      },
    );
    await this.repository.save(projectId, turnId, record);
    return record;
  }
}
