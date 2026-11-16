import { useEffect, useRef } from 'react';
import { Paper, Stack, Text } from '@mantine/core';
import type { Message } from '@choral-writer/shared';

interface MessageListProps {
  messages: Message[];
  partial: string;
  pending: boolean;
}

export function MessageList({ messages, partial, pending }: MessageListProps) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (container.current) container.current.scrollTop = container.current.scrollHeight;
  }, [messages, partial]);

  return (
    <Stack className="chat-messages" ref={container} role="log" aria-label="Conversation" aria-live="polite">
      {messages.length === 0 && !pending && <Text c="dimmed">Envoyez un message pour commencer l’histoire.</Text>}
      {messages.map((message) => (
        <Paper key={message.id} p="md" withBorder className={`chat-message chat-message-${message.role}`}>
          <Text size="xs" c="teal.3" fw={600} mb="xs">{message.role === 'user' ? 'Vous' : 'Assistant'}</Text>
          <Text className="message-content">{message.content}</Text>
        </Paper>
      ))}
      {(pending || partial) && (
        <Paper p="md" withBorder className="chat-message">
          <Text size="xs" c={pending ? 'teal.3' : 'orange'} fw={600} mb="xs">
            {pending ? 'Assistant · génération en cours…' : 'Réponse interrompue · non enregistrée'}
          </Text>
          <Text className="message-content">{partial || 'En attente du modèle…'}</Text>
        </Paper>
      )}
    </Stack>
  );
}
