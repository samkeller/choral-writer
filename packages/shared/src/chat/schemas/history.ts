import { z } from 'zod';

import { chatBranchDtoSchema, chatBranchSchema } from './branch.js';
import { chatTurnDtoSchema, chatTurnSchema } from './turn.js';

export const chatHistoryDtoSchema = z.object({
  branch: chatBranchDtoSchema,
  turns: z.array(chatTurnDtoSchema),
});

export const chatHistorySchema = chatHistoryDtoSchema.extend({
  branch: chatBranchSchema,
  turns: z.array(chatTurnSchema),
});