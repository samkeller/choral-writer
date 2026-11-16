import { z } from 'zod';

import { chatBranchParamsSchema } from './branch.js';
import { messageSchema } from './message.js';

export const chatTurnParamsSchema = chatBranchParamsSchema.extend({ turnId: z.string().uuid() });
export const chatExecutionParamsSchema = chatTurnParamsSchema.omit({ branchId: true });

/** A turn is one pipeline execution, not a mutable pair of chat bubbles. */
export const chatTurnSchema = z.object({
  id: z.string().uuid(),
  parentTurnId: z.string().uuid().nullable(),
  originBranchId: z.string().uuid(),
  retryOfTurnId: z.string().uuid().nullable(),
  regeneratedFromTurnId: z.string().uuid().nullable(),
  status: z.enum(['running', 'completed', 'failed']),
  error: z.string().nullable(),
  userMessage: messageSchema,
  assistantMessage: messageSchema.nullable(),
});