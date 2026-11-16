import { z } from 'zod';

export const publicErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  status: z.number().int().min(400).max(599),
  source: z.enum(['application', 'llm']),
  requestId: z.string().min(1).optional(),
});

export const apiErrorSchema = z.object({ error: publicErrorSchema });

export type PublicError = z.infer<typeof publicErrorSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorSchema>;
