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
