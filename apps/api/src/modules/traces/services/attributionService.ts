import type {
  AttributedItem, TurnAttribution, TurnAttributionResponse, TurnTraceSummary,
} from '@choral-writer/shared';
import { contributionsToldToNarrator } from '@choral-writer/shared';

import { ApiError, notfoundError } from '../../../errors/errors.js';
import type { createCallLLM } from '../../../llm/call-llm.js';
import type { AttributionRepository } from '../repositories/attributionRepository.js';
import { attributionMessages, attributionOutputSchema } from './attributionPrompt.js';

export interface ProseAttributionInput {
  projectId: string;
  /** The calls are traced, and billed, under this turn. */
  turnId: string;
  prose: string;
  /** What the Narrator received, in the order he read it. */
  contributions: readonly AttributedItem[];
}

/**
 * Reads a turn's prose against the contributions its Narrator received, by a small non-streamed LLM call
 * traced under the `attribution` stage. A cached attribution is never recomputed unless asked to.
 */
export class AttributionService {
  /** One computation at a time per turn: a second request joins the one under way instead of paying twice. */
  private readonly pending = new Map<string, Promise<TurnAttribution>>();

  constructor(
    private readonly callLLM: ReturnType<typeof createCallLLM>,
    private readonly repository: Pick<AttributionRepository, 'find' | 'save' | 'listCallCosts'>,
    private readonly summary: (projectId: string, turnId: string) => Promise<TurnTraceSummary>,
  ) {}

  /** The turn's attribution, computed on first request; `regenerate` recomputes it explicitly. */
  async forTurn(projectId: string, turnId: string, { regenerate }: { regenerate: boolean }): Promise<TurnAttributionResponse> {
    const cached = await this.repository.find(projectId, turnId);
    if (cached === undefined) throw notfoundError('Ce tour est introuvable.');
    const attribution = cached && !regenerate ? cached : await this.compute(projectId, turnId);
    const costs = await this.repository.listCallCosts(turnId);
    return {
      attribution,
      cost: {
        microUsd: costs.reduce((total, call) => total + (call.costMicroUsd ?? 0), 0),
        complete: costs.every((call) => call.costMicroUsd !== null),
        calls: costs.length,
      },
    };
  }

  /** Reusable for any prose and contributions, such as variants of a turn compared side by side. */
  async attributeProse({ projectId, turnId, prose, contributions }: ProseAttributionInput): Promise<TurnAttribution> {
    const result = await this.callLLM({
      projectId,
      turnId,
      stage: 'attribution',
      messages: attributionMessages(prose, contributions),
      schema: attributionOutputSchema(contributions.length),
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

  private compute(projectId: string, turnId: string): Promise<TurnAttribution> {
    const running = this.pending.get(turnId);
    if (running) return running;
    const computation = this.computeAndSave(projectId, turnId).finally(() => this.pending.delete(turnId));
    this.pending.set(turnId, computation);
    return computation;
  }

  private async computeAndSave(projectId: string, turnId: string): Promise<TurnAttribution> {
    const summary = await this.summary(projectId, turnId);
    const prose = summary.narrator?.prose;
    if (!prose) throw new ApiError(409, 'ATTRIBUTION_UNAVAILABLE', 'Ce tour n’a pas de prose à attribuer.');
    const whiteboard = summary.analysis.flatMap((agent) => agent.envelope ?? []);
    const attribution = await this.attributeProse({
      projectId, turnId, prose,
      contributions: contributionsToldToNarrator(whiteboard, summary.direction?.direction ?? null),
    });
    await this.repository.save(projectId, turnId, attribution);
    return attribution;
  }
}
