import { z } from 'zod';
import { dateFromJsonSchema } from './dates.js';

export const projectInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  systemPrompt: z.string().trim().max(50_000),
}).strict();

export const projectDtoSchema = projectInputSchema.extend({
  id: z.string().uuid(),
  defaultBranchId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const projectSchema = projectDtoSchema.extend({
  createdAt: dateFromJsonSchema,
  updatedAt: dateFromJsonSchema,
});

export const projectParamsSchema = z.object({ projectId: z.string().uuid() });

export type ProjectInput = z.infer<typeof projectInputSchema>;
export type Project = z.infer<typeof projectSchema>;
export type ProjectDto = z.infer<typeof projectDtoSchema>;
