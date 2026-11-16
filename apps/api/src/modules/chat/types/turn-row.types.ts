import type { chatTurns } from '../../../db/entities/chat/turn.js';
import type { chatMessages } from '../../../db/entities/chat/message.js';

export type TurnRow = {
  turn: typeof chatTurns.$inferSelect;
  user: typeof chatMessages.$inferSelect;
  assistant: typeof chatMessages.$inferSelect | null;
};
