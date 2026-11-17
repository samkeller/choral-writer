import { z } from 'zod';
import { dateFromJsonSchema } from '../../dates.js';

export const messageInputSchema = z.object({
  content: z.string().trim().min(1).max(20_000),
}).strict();

export const messageDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  createdAt: z.string().datetime(),
});

export const messageSchema = messageDtoSchema.extend({ createdAt: dateFromJsonSchema });