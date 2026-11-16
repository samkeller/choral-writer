import type { Message } from '@choral-writer/shared';

import type { ChatMessageRepository } from '../repositories/messageRepository.js';

export class ChatMessageService {
  constructor(private readonly repository: ChatMessageRepository) {}

  createUser(content: string): Promise<Message> {
    return this.repository.create('user', content);
  }

  createAssistant(content: string, at: Date): Promise<Message> {
    return this.repository.create('assistant', content, at);
  }
}
