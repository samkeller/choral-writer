import { useEffect, useRef } from 'react';
import { Group, Loader, Paper, ScrollArea, Stack, Text } from '@mantine/core';
import { IconRoute } from '@tabler/icons-react';
import type { ChatTurn, Message } from '@choral-writer/shared';

import type { ChatPipelineProgress } from '../../hooks/useChat';
import { IconAction } from '../atoms/IconAction';
import { MarkdownContent } from '../llm/MarkdownContent';
import { PipelineProgress } from './PipelineProgress';
import styles from './MessageList.module.css';

interface MessageListProps {
  messages: Message[];
  turns: ChatTurn[];
  partial: string;
  pending: boolean;
  pipelineProgress: ChatPipelineProgress | null;
  onInspectTurn: (turnId: string) => void;
}

export function MessageList({
  messages, turns, partial, pending, pipelineProgress, onInspectTurn,
}: MessageListProps) {
  const container = useRef<HTMLDivElement>(null);
  const initializedScroll = useRef(false);
  const autoScrolledUserMessageId = useRef<string | null>(null);
  const turnByMessageId = new Map(turns.flatMap((turn) => [
    [turn.userMessage.id, turn.id] as const,
    ...(turn.assistantMessage ? [[turn.assistantMessage.id, turn.id] as const] : []),
  ]));

  useEffect(() => {
    const viewport = container.current;
    if (!viewport) return;

    const lastMessage = messages.at(-1);
    if (!initializedScroll.current) {
      initializedScroll.current = true;
      if (messages.length > 0) viewport.scrollTop = viewport.scrollHeight;
    } else if (lastMessage?.role === 'user' && lastMessage.id !== autoScrolledUserMessageId.current) {
      viewport.scrollTop = viewport.scrollHeight;
    }

    if (lastMessage?.role === 'user') autoScrolledUserMessageId.current = lastMessage.id;
  }, [messages]);

  useEffect(() => {
    if (pipelineProgress?.memoryOnly && container.current) {
      container.current.scrollTop = container.current.scrollHeight;
    }
  }, [pipelineProgress?.memoryOnly]);

  return (
    <ScrollArea
      h="100%"
      type="auto"
      offsetScrollbars="y"
      classNames={{ viewport: styles.viewport }}
      viewportRef={container}
      viewportProps={{ role: 'log', 'aria-label': 'Conversation', 'aria-live': 'off' }}
    >
      <Stack gap="md" pr="xs">
        {messages.map((message) => {
          const turnId = turnByMessageId.get(message.id);
          return (
            <Paper
              key={message.id}
              p={{ base: 'xs', sm: 'lg' }}
              withBorder={message.role === 'user'}
              bg={message.role === 'user' ? 'dark.6' : 'transparent'}
              className={message.role === 'user' ? styles.userMessage : styles.assistantMessage}
            >
              <Group justify="space-between" align="center" mb="xs" className={styles.messageHeader}>
                <Text size="xs" c={message.role === 'user' ? 'choral.3' : 'dimmed'} fw={600}>
                  {message.role === 'user' ? 'Vous' : 'Assistant'}
                </Text>
                {turnId && (
                  <IconAction label="Inspecter les traces de ce tour" onClick={() => onInspectTurn(turnId)}>
                    <IconRoute size={16} aria-hidden="true" />
                  </IconAction>
                )}
              </Group>
              {message.role === 'assistant' ? (
                <MarkdownContent content={message.content} className={styles.assistantContent} />
              ) : (
                <Text className={styles.messageContent}>{message.content}</Text>
              )}
            </Paper>
          );
        })}
        {partial && (
          <Paper p={{ base: 'xs', sm: 'lg' }} className={styles.assistantMessage}>
            <MarkdownContent content={partial} className={styles.assistantContent} />
          </Paper>
        )}
        {pipelineProgress && <PipelineProgress progress={pipelineProgress} />}
        {pending && !pipelineProgress && (
          <Loader size="sm" color="choral.3" aria-label="Génération en cours" />
        )}
      </Stack>
    </ScrollArea>
  );
}
