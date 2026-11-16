import { z } from 'zod';

import { publicErrorSchema } from './errors.js';

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

export const chatEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('chat.turn.started'),
    turnId: z.string().uuid(),
    message: messageSchema,
  }),
  z.object({
    type: z.literal('chat.message.delta'),
    delta: z.string(),
  }),
  z.object({
    type: z.literal('chat.turn.completed'),
    turnId: z.string().uuid(),
    message: messageSchema,
  }),
  z.object({
    type: z.literal('chat.turn.failed'),
    turnId: z.string().uuid().optional(),
    error: publicErrorSchema,
  }),
]);

export type Message = z.infer<typeof messageSchema>;
export type ChatEvent = z.infer<typeof chatEventSchema>;
