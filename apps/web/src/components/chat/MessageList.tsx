import { useEffect, useRef } from 'react';
import { Loader, Paper, ScrollArea, Stack, Text } from '@mantine/core';
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
        {partial && (
          <Paper p="md" className={styles.assistantMessage}>
            <Text className={styles.assistantContent}>{partial}</Text>
          </Paper>
        )}
        {pending && <Loader size="sm" color="choral.3" aria-label="Génération en cours" />}
      </Stack>
    </ScrollArea.Autosize>
  );
}
