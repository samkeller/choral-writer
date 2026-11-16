import { z } from 'zod';

import { publicErrorSchema } from '../../errors.js';
import { chatOperationSchema } from './command.js';
import { messageSchema } from './message.js';

export const chatEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('chat.turn.started'),
    turnId: z.string().uuid(),
    branchId: z.string().uuid(),
    operation: chatOperationSchema,
    message: messageSchema,
  }),
  z.object({
    type: z.literal('chat.message.delta'),
    delta: z.string(),
  }),
  z.object({
    type: z.literal('chat.turn.completed'),
    branchId: z.string().uuid(),
    turnId: z.string().uuid(),
    message: messageSchema,
  }),
  z.object({
    type: z.literal('chat.turn.failed'),
    branchId: z.string().uuid().optional(),
    turnId: z.string().uuid().optional(),
    error: publicErrorSchema,
  }),
]);