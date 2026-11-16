import { z } from 'zod';

export const projectInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  systemPrompt: z.string().trim().max(50_000),
}).strict();

export const projectSchema = projectInputSchema.extend({
  id: z.string().uuid(),
  defaultBranchId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const projectParamsSchema = z.object({ projectId: z.string().uuid() });

export type ProjectInput = z.infer<typeof projectInputSchema>;
export type Project = z.infer<typeof projectSchema>;
