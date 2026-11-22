import { useEffect, useRef } from 'react';
import { Group, Loader, Paper, ScrollArea, Stack, Text } from '@mantine/core';
import type { ChatTurn, Message, TurnMetrics } from '@choral-writer/shared';

import type { ChatPipelineProgress } from '../../hooks/useChat';
import { MarkdownContent } from '../llm/MarkdownContent';
import { PipelineProgress } from './PipelineProgress';
import { TurnLine } from './TurnLine';
import styles from './MessageList.module.css';

interface MessageListProps {
  messages: Message[];
  turns: ChatTurn[];
  partial: string;
  pending: boolean;
  pipelineProgress: ChatPipelineProgress | null;
  turnMetrics: ReadonlyMap<string, TurnMetrics>;
  inspectedTurnId: string | null;
  onInspectTurn: (turnId: string) => void;
}

export function MessageList({
  messages, turns, partial, pending, pipelineProgress, turnMetrics, inspectedTurnId, onInspectTurn,
}: MessageListProps) {
  const container = useRef<HTMLDivElement>(null);
  const initializedScroll = useRef(false);
  const autoScrolledUserMessageId = useRef<string | null>(null);
  /** A turn's line follows its last message: the answer, or the input of a failed turn. */
  const turnByLastMessageId = new Map(turns.map((turn, index) => [
    (turn.assistantMessage ?? turn.userMessage).id, { turn, number: index + 1 },
  ] as const));

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
          const endedTurn = turnByLastMessageId.get(message.id);
          return (
            <Stack key={message.id} gap={4}
              align={message.role === 'user' ? 'flex-end' : 'flex-start'} className={styles.messageBlock}>
              <Paper
                p={{ base: 'xs', sm: 'lg' }}
                withBorder={message.role === 'user'}
                bg={message.role === 'user' ? 'dark.6' : 'transparent'}
                className={message.role === 'user' ? styles.userMessage : styles.assistantMessage}
              >
                <Group justify="space-between" align="center" mb="xs" className={styles.messageHeader}>
                  <Text size="xs" c={message.role === 'user' ? 'choral.3' : 'dimmed'} fw={600}>
                    {message.role === 'user' ? 'Vous' : 'Assistant'}
                  </Text>
                </Group>
                {message.role === 'assistant' ? (
                  <MarkdownContent content={message.content} className={styles.assistantContent} />
                ) : (
                  <Text className={styles.messageContent}>{message.content}</Text>
                )}
              </Paper>
              {endedTurn && endedTurn.turn.status !== 'running' && (
                <TurnLine
                  turnNumber={endedTurn.number}
                  metrics={turnMetrics.get(endedTurn.turn.id)}
                  failed={endedTurn.turn.status === 'failed'}
                  selected={inspectedTurnId === endedTurn.turn.id}
                  onOpen={() => onInspectTurn(endedTurn.turn.id)}
                />
              )}
            </Stack>
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
