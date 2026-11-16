import { v7 as uuidv7 } from 'uuid';
import type { Message } from '@choral-writer/shared';

import type { Database, Transaction } from '../../../db/client.js';
import { chatMessages } from '../../../db/entities/chat/message.js';
import { messageDto } from '../mappers/messageDto.js';

export class ChatMessageRepository {
  constructor(
    private readonly database: Database | Transaction,
    private readonly projectId: string,
  ) { }

  async create(role: Message['role'], content: string, createdAt?: Date): Promise<Message> {
    const [row] = await this.database.insert(chatMessages).values({
      id: uuidv7(), projectId: this.projectId, role, content, createdAt,
    }).returning();
    return messageDto(row);
  }
}
