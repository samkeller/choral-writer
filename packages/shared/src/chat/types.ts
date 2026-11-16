import type { z } from 'zod';

import type { messageSchema } from './schemas/message.js';
import type { chatBranchSchema } from './schemas/branch.js';
import type { chatTurnSchema } from './schemas/turn.js';
import type { chatHistorySchema } from './schemas/history.js';
import type { chatCommandSchema, chatOperationSchema } from './schemas/command.js';
import type { chatEventSchema } from './schemas/event.js';

export type Message = z.infer<typeof messageSchema>;
export type ChatBranch = z.infer<typeof chatBranchSchema>;
export type ChatTurn = z.infer<typeof chatTurnSchema>;
export type ChatHistory = z.infer<typeof chatHistorySchema>;
export type ChatOperation = z.infer<typeof chatOperationSchema>;
export type ChatCommand = z.infer<typeof chatCommandSchema>;
export type ChatEvent = z.infer<typeof chatEventSchema>;