import { z } from 'zod';

export const analysisImportanceSchema = z.enum(['LOW', 'NORMAL', 'HIGH']);

export const DEVELOPMENT_KIND = 'development';

/** Where a development happens: in the scene being told, or off-screen. */
export const developmentScopeSchema = z.enum(['scene', 'offscreen']);
export type DevelopmentScope = z.infer<typeof developmentScopeSchema>;

/** A perspective (opinion, suggestion, risk…): its kind is free-form, but never `development`. */
const perspectiveItemSchema = z.object({
  kind: z.string().trim().min(1).refine((kind) => kind !== DEVELOPMENT_KIND, {
    message: 'Un développement exige "characters" et "scope".',
  }),
  text: z.string().trim().min(1),
  importance: analysisImportanceSchema,
}).strict();

/** Something that happens in the story world during the turn: a fact, even when the prose does not tell it. */
const developmentItemSchema = z.object({
  kind: z.literal(DEVELOPMENT_KIND),
  /** The characters concerned. */
  characters: z.array(z.string().trim().min(1)),
  scope: developmentScopeSchema,
  text: z.string().trim().min(1),
  importance: analysisImportanceSchema,
}).strict();

/** Validates what an analysis agent returns: a `development` item must carry its characters and scope. */
const analysisItemSchema = z.union([developmentItemSchema, perspectiveItemSchema]);
export type AnalysisItem = z.infer<typeof analysisItemSchema>;
export type DevelopmentItem = z.infer<typeof developmentItemSchema>;

/**
 * Reads items already recorded (traced envelopes, persisted directions). An item recorded before
 * developments existed may have the free-form kind `development` without a scope: it reads as a
 * perspective, since nothing happened then.
 */
const recordedItemSchema = z.union([developmentItemSchema, perspectiveItemSchema.extend({
  kind: z.string().trim().min(1),
})]);

export function isDevelopment(item: AnalysisItem): item is DevelopmentItem {
  return item.kind === DEVELOPMENT_KIND && 'scope' in item;
}

/** The contract an analysis agent's output is validated against. */
export const analysisEnvelopeSchema = z.object({
  v: z.literal(1),
  agent: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  items: z.array(analysisItemSchema),
}).strict();

export type AnalysisEnvelope = z.infer<typeof analysisEnvelopeSchema>;

/** Reads an envelope already traced, including one recorded under the former item contract. */
export const recordedAnalysisEnvelopeSchema = analysisEnvelopeSchema.extend({
  items: z.array(recordedItemSchema),
});

/** Target the Director sets for a turn's tension. */
export const tensionTargetSchema = z.enum(['monter', 'tenir', 'relacher', 'basculer']);
export type TensionTarget = z.infer<typeof tensionTargetSchema>;

/** Fixed nudge vocabulary, from the lightest pressure to the strongest. A nudge never introduces a fact. */
export const nudgeTypeSchema = z.enum(['saillance', 'retard', 'pression', 'complication', 'relance']);
export type NudgeType = z.infer<typeof nudgeTypeSchema>;

/**
 * A whiteboard item as its analysis agent wrote it, with the agent that wrote it. It is read from
 * recorded directions, hence the tolerant item schema.
 */
export const attributedItemSchema = z.object({
  agent: z.string(),
  item: recordedItemSchema,
});
export type AttributedItem = z.infer<typeof attributedItemSchema>;

export const attributedDevelopmentSchema = z.object({
  agent: z.string(),
  item: developmentItemSchema,
});
export type AttributedDevelopment = z.infer<typeof attributedDevelopmentSchema>;

/** The developments that happened during a turn, split by scope for the Debug mode. */
export const turnDevelopmentsSchema = z.object({
  scene: z.array(attributedDevelopmentSchema),
  offscreen: z.array(attributedDevelopmentSchema),
});
export type TurnDevelopments = z.infer<typeof turnDevelopmentsSchema>;

/**
 * What the Director decided for a turn, resolved against the whiteboard it read:
 * selected items are copied verbatim, so the record stays readable without that whiteboard.
 */
export const turnDirectionSchema = z.object({
  tension: tensionTargetSchema,
  nudges: z.array(z.object({
    type: nudgeTypeSchema,
    target: z.string(),
    /** The contribution of the agent that embodies the character the nudge involves. */
    basis: attributedItemSchema.nullable(),
  })).max(2),
  retained: z.array(attributedItemSchema.extend({ why: z.string() })),
  dismissed: z.array(attributedItemSchema.extend({ why: z.string() })),
});
export type TurnDirection = z.infer<typeof turnDirectionSchema>;
