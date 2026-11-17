import { z } from 'zod';

import { publicErrorSchema } from '../../errors.js';
import { chatOperationSchema } from './command.js';
import { messageDtoSchema, messageSchema } from './message.js';

export const chatEventDtoSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('chat.turn.started'),
    turnId: z.string().uuid(),
    branchId: z.string().uuid(),
    operation: chatOperationSchema,
    message: messageDtoSchema,
  }),
  z.object({
    type: z.literal('chat.message.delta'),
    delta: z.string(),
  }),
  z.object({
    type: z.literal('chat.turn.completed'),
    branchId: z.string().uuid(),
    turnId: z.string().uuid(),
    message: messageDtoSchema,
  }),
  z.object({
    type: z.literal('chat.turn.failed'),
    branchId: z.string().uuid().optional(),
    turnId: z.string().uuid().optional(),
    error: publicErrorSchema,
  }),
]);

export const chatEventSchema = chatEventDtoSchema.transform((event) => {
  switch (event.type) {
    case 'chat.turn.started':
    case 'chat.turn.completed':
      return { ...event, message: messageSchema.parse(event.message) };
    default:
      return event;
  }
});