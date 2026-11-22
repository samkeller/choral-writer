import { z } from 'zod';

export const analysisImportanceSchema = z.enum(['LOW', 'NORMAL', 'HIGH']);

export const analysisEnvelopeSchema = z.object({
  v: z.literal(1),
  agent: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  items: z.array(z.object({
    kind: z.string().trim().min(1),
    text: z.string().trim().min(1),
    importance: analysisImportanceSchema,
  }).strict()),
}).strict();

export type AnalysisEnvelope = z.infer<typeof analysisEnvelopeSchema>;

export type AnalysisItem = AnalysisEnvelope['items'][number];

/** Target the Director sets for a turn's tension. */
export const tensionTargetSchema = z.enum(['monter', 'tenir', 'relacher', 'basculer']);
export type TensionTarget = z.infer<typeof tensionTargetSchema>;

/** Fixed nudge vocabulary, from the lightest pressure to the strongest. A nudge never introduces a fact. */
export const nudgeTypeSchema = z.enum(['saillance', 'retard', 'pression', 'complication', 'relance']);
export type NudgeType = z.infer<typeof nudgeTypeSchema>;

/** A whiteboard item as its analysis agent wrote it, with the agent that wrote it. */
export const attributedItemSchema = z.object({
  agent: z.string(),
  item: analysisEnvelopeSchema.shape.items.element,
});
export type AttributedItem = z.infer<typeof attributedItemSchema>;

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
