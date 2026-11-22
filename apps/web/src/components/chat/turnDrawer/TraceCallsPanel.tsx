import { useEffect, useState } from 'react';
import {
  Alert, Badge, Button, Group, Loader, Paper, Stack, Tabs, Text,
} from '@mantine/core';
import { IconArrowLeft, IconChevronRight, IconRefresh } from '@tabler/icons-react';
import type { MemoryContext, TraceCallDetail, TraceCallSummary } from '@choral-writer/shared';

import { getTraceCallDetail } from '../../../api/chat/traceApi';
import { getErrorMessage } from '../../../api/client';
import { LLMResponseDisplay } from '../../llm/LLMResponseDisplay';
import { PromptDisplay } from '../../llm/PromptDisplay';
import { MarkdownContent } from '../../llm/MarkdownContent';
import { stagePresentationOf } from '../../phases/stagePresentation';
import { formatSeconds, formatTokens } from '../turnFormat';
import styles from './TurnDrawer.module.css';

/** « Appels bruts » : every LLM call of the turn, with its prompt and response loaded on demand. */
export function TraceCallsPanel({ projectId, turnId, calls }: {
  projectId: string;
  turnId: string;
  calls: TraceCallSummary[];
}) {
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TraceCallDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!selectedCallId) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setDetail(null);
    void getTraceCallDetail(projectId, turnId, selectedCallId, controller.signal)
      .then(setDetail)
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) setError(getErrorMessage(loadError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [projectId, turnId, selectedCallId, revision]);

  if (!selectedCallId) return <CallsList calls={calls} onSelectCall={setSelectedCallId} />;
  return (
    <CallDetailView
      call={calls.find((call) => call.id === selectedCallId) ?? null}
      detail={detail}
      loading={loading}
      error={error}
      onBack={() => setSelectedCallId(null)}
      onRetry={() => setRevision((value) => value + 1)}
    />
  );
}

function CallsList({
  calls, onSelectCall,
}: {
  calls: TraceCallSummary[];
  onSelectCall: (callId: string) => void;
}) {
  if (calls.length === 0) return <Text c="dimmed">Aucun appel LLM enregistré.</Text>;

  return (
    <Stack gap="xs">
      {calls.map((call) => (
        <Button
          key={call.id}
          variant="light"
          color={call.status === 'success' ? 'gray' : 'red'}
          fullWidth
          className={styles.callButton}
          onClick={() => onSelectCall(call.id)}
          styles={{
            inner: { justifyContent: 'space-between', width: '100%' },
            label: { width: '100%', minWidth: 0, whiteSpace: 'normal' },
          }}
        >
          <Group justify="space-between" w="100%">
            <Stack gap={2} align="flex-start" style={{ flex: '1 1 10rem', minWidth: 0 }}>
              <Text size="sm">{callLabel(call)}</Text>
              <Text size="xs" c="dimmed">
                {formatSeconds(call.durationMs)} · {formatTokens(call.inputTokens)} → {formatTokens(call.outputTokens)} tokens
              </Text>
            </Stack>
            <StatusBadge status={call.status} />
          </Group>
        </Button>
      ))}
    </Stack>
  );
}

function CallDetailView({
  call, detail, loading, error, onBack, onRetry,
}: {
  call: TraceCallSummary | null;
  detail: TraceCallDetail | null;
  loading: boolean;
  error: string;
  onBack: () => void;
  onRetry: () => void;
}) {
  return (
    <Stack gap="md" className={styles.callDetail}>
      <Group justify="space-between">
        <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={onBack}>
          Retour aux appels
        </Button>
        {call && (
          <Text size="xs" c="dimmed">
            {callLabel(call)} · {formatSeconds(call.durationMs)} · {formatTokens(call.inputTokens)} → {formatTokens(call.outputTokens)} tokens
          </Text>
        )}
      </Group>
      {loading && <Loader color="choral" aria-label="Chargement de l’appel" />}
      {error && (
        <Alert color="red" title="Impossible de charger l’appel" role="alert">
          <Stack gap="sm">
            <Text>{error}</Text>
            <Button variant="light" leftSection={<IconRefresh size={16} />} onClick={onRetry}>
              Réessayer
            </Button>
          </Stack>
        </Alert>
      )}
      {detail && (
        <>
        <ReceivedMemory memory={detail.request.memory} />
        <Tabs defaultValue="response" key={detail.id} classNames={{ root: styles.tabs, list: styles.tabList }}>
          <Tabs.List grow>
            <Tabs.Tab value="response">Réponse</Tabs.Tab>
            <Tabs.Tab value="prompt">Prompt</Tabs.Tab>
            <Tabs.Tab value="raw">Brut</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="prompt" pt="md">
            <Text size="sm" c="dimmed" mb="xs">Messages réellement envoyés à cet appel, y compris les souvenirs éventuels.</Text>
            <Stack gap="xs" className={styles.promptMessages}>
              {detail.request.messages.map((message, index) => {
                const content = formatValue(message.content);
                return (
                  <details
                    key={`${message.role}-${index}`}
                    open={index === detail.request.messages.length - 1}
                    className={styles.promptMessage}
                  >
                    <summary>
                      <IconChevronRight size={14} aria-hidden="true" className={styles.promptChevron} />
                      <span className={styles.messageRole}>{message.role}</span>
                      <span className={styles.messagePreview}>{previewValue(content)}</span>
                    </summary>
                    <div className={styles.promptContent}>
                      <PromptDisplay content={content} compact={true}/>
                    </div>
                  </details>
                );
              })}
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="response" pt="md">
            <LLMResponseDisplay response={detail.response} />
          </Tabs.Panel>
          <Tabs.Panel value="raw" pt="md">
            <Text component="pre" size="xs" className={styles.rawDetail}>
              {formatValue(detail)}
            </Text>
          </Tabs.Panel>
        </Tabs>
        </>
      )}
    </Stack>
  );
}

export function ReceivedMemory({ memory }: { memory: MemoryContext | undefined }) {
  return <details>
    <summary>Mémoire reçue{memory ? ` · ${memory.entries.length} entrée(s)` : ''}</summary>
    <Stack gap="sm" mt="sm">
      {!memory ? <Text size="sm" c="dimmed">Détail mémoire indisponible pour cet ancien appel.</Text> : <>
        {memory.tags.length > 0 && <Stack gap="xs"><Text size="sm" fw={600}>Définitions de tags reçues</Text>
          {memory.tags.map((tag) => <Text key={tag.id} size="sm"><strong>{tag.name}</strong> · {tag.description}</Text>)}</Stack>}
        {memory.entries.length === 0 && <Text size="sm" c="dimmed">Aucune entrée mémoire reçue.</Text>}
        {memory.entries.map((entry) => <Paper key={entry.id} withBorder p="sm"><Stack gap="xs">
          <Text fw={600}>{entry.key}</Text>
          <Group gap={4}>{entry.tagIds.map((id) => <Badge key={id} color="gray" variant="light">{memory.tags.find((tag) => tag.id === id)?.name ?? id}</Badge>)}</Group>
          <MarkdownContent content={entry.content} />
          {entry.legacy && <Text size="xs" c="dimmed">Ancien périmètre : {entry.legacy.scopeName}</Text>}
        </Stack></Paper>)}
      </>}
    </Stack>
  </details>;
}

function previewValue(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function StatusBadge({ status }: { status: 'success' | 'error' }) {
  return <Badge color={status === 'success' ? 'green' : 'red'}>{status === 'success' ? 'OK' : 'Erreur'}</Badge>;
}

function callLabel(call: TraceCallSummary): string {
  const stage = stagePresentationOf(call.stage).label;
  return `${call.agentName ?? stage} · ${stage}`;
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  const json = JSON.stringify(value, null, 2);
  return json ?? String(value);
}
