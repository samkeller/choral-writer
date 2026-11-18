import type { chatTurns } from '../../../db/entities/chat/turn.js';
import type { chatMessages } from '../../../db/entities/chat/message.js';
import type { MemoryResult } from '@choral-writer/shared';

export type TurnRow = {
  turn: typeof chatTurns.$inferSelect;
  user: typeof chatMessages.$inferSelect;
  assistant: typeof chatMessages.$inferSelect | null;
  memoryResult?: MemoryResult | null;
};
