import { z } from 'zod';

import { chatBranchParamsSchema } from './branch.js';
import { messageInputSchema } from './message.js';
import { chatTurnParamsSchema } from './turn.js';

export const headInputSchema = z.object({
  expectedHeadTurnId: z.string().uuid().nullable(),
}).strict();

export const sendMessageSchema = headInputSchema.merge(messageInputSchema);
export const chatOperationSchema = z.enum(['send', 'regenerate', 'retry']);
export const chatCommandSchema = z.discriminatedUnion('operation', [
  chatBranchParamsSchema.merge(sendMessageSchema).extend({ operation: z.literal('send') }).strict(),
  chatTurnParamsSchema.merge(headInputSchema).extend({ operation: z.literal('regenerate') }).strict(),
  chatTurnParamsSchema.merge(headInputSchema).extend({ operation: z.literal('retry') }).strict(),
]);