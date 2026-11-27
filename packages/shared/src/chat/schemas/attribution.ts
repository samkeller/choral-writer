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
    /** Where or how the prose shows it, in a few words; empty when the model gave none. */
    note: z.string(),
  })),
  /** The call that produced this attribution. */
  callId: z.string().uuid(),
  createdAt: z.string().datetime(),
});
export type TurnAttribution = z.infer<typeof turnAttributionSchema>;

/** The last attribution that failed, kept so that reopening the turn shows it instead of paying again. */
export const attributionFailureSchema = z.object({
  code: z.string(),
  message: z.string(),
  failedAt: z.string().datetime(),
});
export type AttributionFailure = z.infer<typeof attributionFailureSchema>;

/**
 * What is cached on a turn: the last attribution that succeeded, and the last failure when it came after it.
 * A failed regeneration keeps the previous attribution; a success clears the failure.
 */
export const turnAttributionRecordSchema = z.object({
  attribution: turnAttributionSchema.nullable(),
  failure: attributionFailureSchema.nullable(),
});
export type TurnAttributionRecord = z.infer<typeof turnAttributionRecordSchema>;

export const turnAttributionRequestSchema = z.object({
  /** Recompute even when an attribution or a failure is cached; only ever sent on an explicit click. */
  regenerate: z.boolean().default(false),
});
export type TurnAttributionRequest = z.input<typeof turnAttributionRequestSchema>;

export const turnAttributionResponseSchema = turnAttributionRecordSchema.extend({
  /** Every attribution call of the turn, failures and regenerations included; never part of the turn's own cost. */
  cost: turnCostSchema.extend({ calls: z.number().int().nonnegative() }),
});
export type TurnAttributionResponse = z.infer<typeof turnAttributionResponseSchema>;
