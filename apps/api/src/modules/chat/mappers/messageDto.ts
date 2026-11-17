import type { Message, MessageDto } from '@choral-writer/shared';

export function toMessageDto(message: Message): MessageDto {
  return {
    id: message.id,
    projectId: message.projectId,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
  };
}
