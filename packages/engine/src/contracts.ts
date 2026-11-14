import { z } from 'zod';

const text = z.string().trim().min(1);
const key = text.regex(/^[a-z0-9][a-z0-9_-]*$/);
const reference = z.string().regex(/^F[1-9][0-9]*$/);
export const importanceSchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export const envelopeSchema = z.object({
  analysis: z.string(),
  constraints: z.array(z.string()),
  notes: z.array(z.string()),
  remember: z.array(z.object({
    text, about: z.array(key).optional(), importance: importanceSchema.optional()
  }))
});
export const interpretationSchema = z.object({
  controlled: z.array(z.object({ character: key, action: text })),
  intentions: z.array(z.string()),
  entities: z.array(key),
  time_scale: z.string(),
  meta_direction: z.string().nullable()
});
export const resolutionSchema = z.object({
  happened: z.array(z.object({
    text, participants: z.array(key), location: key.nullable().optional()
  })).min(1),
  time: z.object({ label: text, elapsed_days: z.number().finite().nonnegative() })
});

const quote = { source_quote: text };
export const proposalSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('create_entity'), key, name: text, kind: text,
    description: z.string().default(''), attributes: z.record(z.unknown()).default({}), ...quote }).strict(),
  z.object({ op: z.literal('update_entity'), key,
    patch: z.object({ name: text.optional(), kind: text.optional(), description: z.string().optional(),
      attributes: z.record(z.unknown()).optional() }).strict(),
    reason: text, ...quote }).strict(),
  z.object({ op: z.literal('add_fact'), text, subjects: z.array(key), tags: z.array(text),
    importance: importanceSchema, public: z.boolean(), known_by: z.array(key), ...quote }).strict(),
  z.object({ op: z.literal('supersede_fact'), ref: reference, new_text: text.optional(),
    known_by: z.array(key).optional(), reason: text.optional(),
    resolution_event: z.number().int().nonnegative().optional(), ...quote }).strict(),
  z.object({ op: z.literal('set_knowledge'), character: key, fact_ref: reference.optional(),
    content: text.optional(), status: z.enum(['knows', 'believes', 'suspects']),
    is_false: z.boolean(), ...quote }).strict()
]);
export const proposalsSchema = z.object({ proposals: z.array(z.unknown()) });

export type Proposal = z.infer<typeof proposalSchema>;
export type Resolution = z.infer<typeof resolutionSchema>;
export type Interpretation = z.infer<typeof interpretationSchema>;
export type Envelope = z.infer<typeof envelopeSchema>;
