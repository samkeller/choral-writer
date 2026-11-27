import { z } from 'zod';

import { attributedItemSchema } from '../../pipeline.js';
import { turnCostSchema } from './traces.js';

/** How much of a contribution the Narrator's prose shows: fully, partly, or not at all. */
export const attributionVerdictSchema = z.enum(['retenu', 'partiel', 'absent']);
export type AttributionVerdict = z.infer<typeof attributionVerdictSchema>;

/**
 * What a turn's prose made of the contributions the Narrator received, as judged by a small LLM call
 * after the turn. It is a reading of the prose, not a proof of influence.
 */
export const turnAttributionSchema = z.object({
  /** One or two sentences: what happened in the turn. */
  whatHappened: z.string().min(1),
  /** Every contribution transmitted to the Narrator, in the order he read them. */
  contributions: z.array(attributedItemSchema.extend({
    verdict: attributionVerdictSchema,
    /** Where or how the prose shows it, in a few words. */
    note: z.string(),
  })),
  /** The call that produced this attribution. */
  callId: z.string().uuid(),
  createdAt: z.string().datetime(),
});
export type TurnAttribution = z.infer<typeof turnAttributionSchema>;

export const turnAttributionRequestSchema = z.object({
  /** Recompute even when an attribution is cached; never done automatically. */
  regenerate: z.boolean().default(false),
});
export type TurnAttributionRequest = z.input<typeof turnAttributionRequestSchema>;

export const turnAttributionResponseSchema = z.object({
  attribution: turnAttributionSchema,
  /** Every attribution call of the turn, failures and regenerations included; never part of the turn's own cost. */
  cost: turnCostSchema.extend({ calls: z.number().int().nonnegative() }),
});
export type TurnAttributionResponse = z.infer<typeof turnAttributionResponseSchema>;
