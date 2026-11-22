import { useEffect, useState } from 'react';
import {
  Alert, Badge, Button, Drawer, Group, Loader, Paper, Stack, Tabs, Text,
} from '@mantine/core';
import { IconArrowLeft, IconChevronRight, IconRefresh } from '@tabler/icons-react';
import type {
  DirectionTrace, MemoryContext, TraceCallDetail, TraceCallSummary, TurnTraceSummary,
} from '@choral-writer/shared';

import { getTraceCallDetail, getTurnTraceSummary } from '../../api/chat/traceApi';
import { getErrorMessage } from '../../api/client';
import { AnalysisEnvelopeDisplay } from '../llm/AnalysisEnvelopeDisplay';
import { LLMResponseDisplay } from '../llm/LLMResponseDisplay';
import { PromptDisplay } from '../llm/PromptDisplay';
import { MarkdownContent } from '../llm/MarkdownContent';
import { MemoryTracePanel } from '../memories/MemoryTracePanel';
import { TurnConfigurationPanel } from './TurnConfigurationPanel';
import styles from './TraceDrawer.module.css';

interface TraceDrawerProps {
  projectId: string;
  turnId: string;
  onClose: () => void;
}

export function TraceDrawer({ projectId, turnId, onClose }: TraceDrawerProps) {
  const [summary, setSummary] = useState<TurnTraceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TraceCallDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailRevision, setDetailRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setSelectedCallId(null);
    setDetail(null);
    void getTurnTraceSummary(projectId, turnId, controller.signal).then(setSummary).catch((loadError: unknown) => {
      if (!controller.signal.aborted) setError(getErrorMessage(loadError));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [projectId, turnId, revision]);

  useEffect(() => {
    if (!selectedCallId) return;
    const controller = new AbortController();
    setDetailLoading(true);
    setDetailError('');
    setDetail(null);
    void getTraceCallDetail(projectId, turnId, selectedCallId, controller.signal)
      .then(setDetail)
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) setDetailError(getErrorMessage(loadError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });
    return () => controller.abort();
  }, [projectId, turnId, selectedCallId, detailRevision]);

  return (
    <Drawer
      opened
      onClose={onClose}
      position="right"
      size="min(100vw, 60rem)"
      title={selectedCallId ? 'Détail de l’appel' : 'Traces du tour'}
      overlayProps={{ backgroundOpacity: 0.35, blur: 3 }}
      classNames={{ content: styles.drawer, body: styles.body, header: styles.header }}
      closeButtonProps={{ 'aria-label': 'Fermer les traces' }}
    >
      {selectedCallId ? (
        <CallDetailView
          call={summary?.calls.find((call) => call.id === selectedCallId) ?? null}
          detail={detail}
          loading={detailLoading}
          error={detailError}
          onBack={() => setSelectedCallId(null)}
          onRetry={() => setDetailRevision((value) => value + 1)}
        />
      ) : (
        <TraceSummaryView
          projectId={projectId}
          summary={summary}
          loading={loading}
          error={error}
          onSelectCall={setSelectedCallId}
          onRetry={() => setRevision((value) => value + 1)}
        />
      )}
    </Drawer>
  );
}

function TraceSummaryView({
  summary, loading, error, onSelectCall, onRetry, projectId,
}: {
  projectId: string;
  summary: TurnTraceSummary | null;
  loading: boolean;
  error: string;
  onSelectCall: (callId: string) => void;
  onRetry: () => void;
}) {
  if (loading) return <Loader color="choral" aria-label="Chargement des traces" />;
  if (error) {
    return (
      <Alert color="red" title="Impossible de charger les traces" role="alert">
        <Stack gap="sm">
          <Text>{error}</Text>
          <Button variant="light" leftSection={<IconRefresh size={16} />} onClick={onRetry}>
            Réessayer
          </Button>
        </Stack>
      </Alert>
    );
  }
  if (!summary) return <Text c="dimmed">Aucune trace disponible pour ce tour.</Text>;

  return (
    <Tabs defaultValue="pipeline" keepMounted={false} key={summary.turnId} classNames={{ root: styles.tabs, list: styles.tabList }}>
      <Tabs.List grow>
        <Tabs.Tab value="pipeline">Pipeline</Tabs.Tab>
        <Tabs.Tab value="whiteboard">Whiteboard</Tabs.Tab>
        <Tabs.Tab value="calls">Appels ({summary.calls.length})</Tabs.Tab>
        <Tabs.Tab value="memory">Mémoire</Tabs.Tab>
        <Tabs.Tab value="configuration">Configuration du tour</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="pipeline" pt="md">
        <PipelinePanel summary={summary} onSelectCall={onSelectCall} />
      </Tabs.Panel>
      <Tabs.Panel value="whiteboard" pt="md">
        <WhiteboardPanel summary={summary} />
      </Tabs.Panel>
      <Tabs.Panel value="calls" pt="md">
        <CallsPanel calls={summary.calls} onSelectCall={onSelectCall} />
      </Tabs.Panel>
      <Tabs.Panel value="memory" pt="md">
        <MemoryTracePanel projectId={projectId} turnId={summary.turnId} />
      </Tabs.Panel>
      <Tabs.Panel value="configuration" pt="md">
        <TurnConfigurationPanel configuration={summary.configuration} />
      </Tabs.Panel>
    </Tabs>
  );
}

function PipelinePanel({
  summary, onSelectCall,
}: {
  summary: TurnTraceSummary;
  onSelectCall: (callId: string) => void;
}) {
  const narratorCall = [...summary.calls].reverse().find((call) => call.stage === 'narrator');

  return (
    <Stack gap="md">
      <Paper p="sm" withBorder>
        <Group justify="space-between" mb="xs">
          <Text fw={600}>Analyse</Text>
          <Text size="xs" c="dimmed">{summary.analysis.length} agent(s)</Text>
        </Group>
        {summary.analysis.length === 0 ? (
          <Text size="sm" c="dimmed">Aucun agent d’analyse configuré.</Text>
        ) : (
          <Stack gap="xs">
            {summary.analysis.map((agent) => {
              const call = findAnalysisCall(summary.calls, agent.agentVersionId, agent.agentId);
              return (
                <Paper key={`${agent.agentId ?? agent.name}-${agent.agentVersionId ?? 'unknown'}`} p="xs" bg="dark.7">
                  <Group justify="space-between" align="center">
                    <Stack gap={2}>
                      <Text size="sm" fw={500}>{agent.name}</Text>
                      <Text size="xs" c="dimmed">
                        {formatDuration(agent.durationMs)} · {agent.attempts} appel(s)
                      </Text>
                    </Stack>
                    <Group gap="xs">
                      <StatusBadge status={agent.status} />
                      {call && (
                        <Button size="compact-xs" variant="subtle" onClick={() => onSelectCall(call.id)}>
                          Inspecter
                        </Button>
                      )}
                    </Group>
                  </Group>
                  {agent.envelope && <Text size="sm" mt="xs">{agent.envelope.summary}</Text>}
                </Paper>
              );
            })}
          </Stack>
        )}
      </Paper>
      {summary.direction && <DirectionStep trace={summary.direction} calls={summary.calls} onSelectCall={onSelectCall} />}
      <Paper p="sm" withBorder>
        <Group justify="space-between" mb="xs">
          <Text fw={600}>Narrateur</Text>
          {summary.narrator && (
            <Group gap="xs">
              <Text size="xs" c="dimmed">{formatDuration(summary.narrator.durationMs)}</Text>
              <StatusBadge status={summary.narrator.status} />
              {narratorCall && (
                <Button size="compact-xs" variant="subtle" onClick={() => onSelectCall(narratorCall.id)}>
                  Inspecter
                </Button>
              )}
            </Group>
          )}
        </Group>
        {summary.narrator
          ? (
            <Text size="sm">{summary.narrator.prose ?? 'Réponse narrative indisponible.'}</Text>
          )
          : <Text size="sm" c="dimmed">Aucun appel narrateur enregistré.</Text>}
      </Paper>
    </Stack>
  );
}

function DirectionStep({
  trace, calls, onSelectCall,
}: {
  trace: DirectionTrace;
  calls: TraceCallSummary[];
  onSelectCall: (callId: string) => void;
}) {
  const lastCall = calls.filter((call) => call.stage === 'direction').at(-1);
  const cost = `${formatCost(trace.cost.microUsd)}${trace.cost.complete ? '' : ' (partiel)'}`;
  const { direction } = trace;

  return (
    <Paper p="sm" withBorder>
      <Group justify="space-between" mb="xs">
        <Text fw={600}>Direction · {trace.name}</Text>
        <Group gap="xs">
          <Text size="xs" c="dimmed">
            {formatDuration(trace.durationMs)} · {trace.attempts} appel(s) · {cost}
          </Text>
          <StatusBadge status={trace.status} />
          {lastCall && (
            <Button size="compact-xs" variant="subtle" onClick={() => onSelectCall(lastCall.id)}>
              Inspecter
            </Button>
          )}
        </Group>
      </Group>
      {direction
        ? (
          <Text size="sm">
            Tension : {direction.tension} · {direction.nudges.length} nudge(s) · {direction.retained.length} retenu(s),{' '}
            {direction.dismissed.length} écarté(s)
          </Text>
        )
        : <Text size="sm" c="dimmed">Direction indisponible : le Narrateur a reçu le whiteboard complet.</Text>}
    </Paper>
  );
}

function WhiteboardPanel({ summary }: { summary: TurnTraceSummary }) {
  const envelopes = summary.analysis.flatMap((agent) => agent.envelope
    ? [{ agent, envelope: agent.envelope }]
    : []);
  if (envelopes.length === 0) {
    return <Text c="dimmed">Aucune enveloppe d’analyse valide n’est disponible pour ce tour.</Text>;
  }

  return (
    <Stack gap="sm">
      {envelopes.map(({ agent, envelope }) => (
        <AnalysisEnvelopeDisplay
          key={`${agent.agentId ?? agent.name}-${agent.agentVersionId ?? 'unknown'}`}
          envelope={envelope}
          agentName={agent.name}
        />
      ))}
    </Stack>
  );
}

function CallsPanel({
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
              <Text size="sm">{call.agentName ?? stageLabel(call.stage)} · {stageLabel(call.stage)}</Text>
              <Text size="xs" c="dimmed">
                {formatDuration(call.durationMs)} · {formatTokens(call.inputTokens)} → {formatTokens(call.outputTokens)} tokens
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
          Retour aux traces
        </Button>
        {call && (
          <Text size="xs" c="dimmed">
            {call.agentName ?? stageLabel(call.stage)} · {stageLabel(call.stage)} · {formatDuration(call.durationMs)} · {formatTokens(call.inputTokens)} → {formatTokens(call.outputTokens)} tokens
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

function stageLabel(stage: string): string {
  if (stage === 'analysis') return 'Analyse';
  if (stage === 'direction') return 'Direction';
  if (stage === 'narrator') return 'Narrateur';
  if (stage === 'guardian') return 'Gardien';
  if (stage === 'reducer') return 'Écriture mémoire';
  return stage;
}

function findAnalysisCall(
  calls: TraceCallSummary[], agentVersionId: string | null, agentId: string | null,
): TraceCallSummary | undefined {
  return [...calls].reverse().find((call) => call.stage === 'analysis'
    && (agentVersionId ? call.agentVersionId === agentVersionId : call.agentId === agentId));
}

function formatDuration(durationMs: number): string {
  return `${(durationMs / 1000).toFixed(1)} s`;
}

function formatCost(microUsd: number): string {
  return `${(microUsd / 1_000_000).toFixed(4)} $`;
}

function formatTokens(tokens: number | null): string {
  return tokens === null ? '—' : String(tokens);
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  const json = JSON.stringify(value, null, 2);
  return json ?? String(value);
}
