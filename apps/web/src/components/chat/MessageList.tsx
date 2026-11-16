import { useEffect, useRef } from 'react';
import { Paper, ScrollArea, Stack, Text } from '@mantine/core';
import type { Message } from '@choral-writer/shared';

import styles from './MessageList.module.css';

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
    <ScrollArea.Autosize
      mah="min(62dvh, 44rem)"
      mih="12rem"
      type="auto"
      offsetScrollbars="y"
      viewportRef={container}
      viewportProps={{ role: 'log', 'aria-label': 'Conversation', 'aria-live': 'polite' }}
    >
      <Stack gap="md" pr="xs">
        {messages.length === 0 && !pending && (
          <Text c="dimmed">Envoyez un message pour commencer l’histoire.</Text>
        )}
        {messages.map((message) => (
          <Paper
            key={message.id}
            p="md"
            withBorder={message.role === 'user'}
            bg={message.role === 'user' ? 'dark.6' : 'transparent'}
            className={message.role === 'user' ? styles.userMessage : styles.assistantMessage}
          >
            <Text size="xs" c={message.role === 'user' ? 'choral.3' : 'dimmed'} fw={600} mb="xs">
              {message.role === 'user' ? 'Vous' : 'Assistant'}
            </Text>
            <Text className={message.role === 'assistant' ? styles.assistantContent : styles.messageContent}>
              {message.content}
            </Text>
          </Paper>
        ))}
        {(pending || partial) && (
          <Paper p="md" bg="transparent" className={styles.assistantMessage}>
            <Text size="xs" c={pending ? 'choral.3' : 'yellow.4'} fw={600} mb="xs">
              {pending ? 'Assistant · génération en cours…' : 'Réponse interrompue · non enregistrée'}
            </Text>
            <Text className={styles.assistantContent}>{partial || 'En attente du modèle…'}</Text>
          </Paper>
        )}
      </Stack>
    </ScrollArea.Autosize>
  );
}
