import { z } from 'zod';

import { chatBranchSchema } from './branch.js';
import { chatTurnSchema } from './turn.js';

export const chatHistorySchema = z.object({
  branch: chatBranchSchema,
  turns: z.array(chatTurnSchema),
});