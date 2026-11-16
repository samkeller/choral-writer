import { z } from 'zod';

export const messageInputSchema = z.object({
  content: z.string().trim().min(1).max(20_000),
}).strict();

export const messageSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  createdAt: z.string().datetime(),
});