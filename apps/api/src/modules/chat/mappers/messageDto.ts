import type { Message } from '@choral-writer/shared';

import type { chatMessages } from '../../../db/entities/chat/message.js';

export function messageDto(row: typeof chatMessages.$inferSelect): Message {
  return { ...row, createdAt: row.createdAt.toISOString() };
}
