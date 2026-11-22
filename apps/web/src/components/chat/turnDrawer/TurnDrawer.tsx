import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Button, Drawer, Group, Loader, Stack, Tabs, Text } from '@mantine/core';
import { IconChevronLeft, IconChevronRight, IconRefresh } from '@tabler/icons-react';
import type { TurnMetrics, TurnTraceSummary } from '@choral-writer/shared';

import { getTurnTraceSummary } from '../../../api/chat/traceApi';
import { getErrorMessage } from '../../../api/client';
import { IconAction } from '../../atoms/IconAction';
import { MemoryTracePanel } from '../../memories/MemoryTracePanel';
import { StoryPanel } from './StoryPanel';
import { TraceCallsPanel } from './TraceCallsPanel';
import { TurnConfigurationPanel } from './TurnConfigurationPanel';
import { TurnContextPanel } from './TurnContextPanel';
import { TurnCostPanel } from './TurnCostPanel';
import { TurnOverview } from './TurnOverview';
import { isTurnDrawerTab, turnDrawerTabs, type TurnDrawerTab } from './turnDrawerTabs';
import styles from './TurnDrawer.module.css';

interface TurnDrawerProps {
  projectId: string;
  /** Turns of the displayed branch, root first. */
  turnIds: string[];
  /** Metrics aligned with `turnIds`; null while loading or when they could not be loaded. */
  metrics: TurnMetrics[] | null;
  metricsError: string;
  onRetryMetrics: () => void;
  turnId: string;
  onSelectTurn: (turnId: string) => void;
  onClose: () => void;
}

/** The turn drawer (« mode Debug ») : one turn at a time, browsable turn by turn on the same tab. */
export function TurnDrawer({
  projectId, turnIds, metrics, metricsError, onRetryMetrics, turnId, onSelectTurn, onClose,
}: TurnDrawerProps) {
  const [tab, setTab] = useState<TurnDrawerTab>('overview');
  const summary = useTurnTraceSummary(projectId, turnId);
  const index = turnIds.indexOf(turnId);
  const alignedMetrics = metrics?.length === turnIds.length ? metrics : null;
  const selectIndex = (target: number) => {
    const targetId = turnIds[target];
    if (targetId) onSelectTurn(targetId);
  };

  return (
    <Drawer.Root opened onClose={onClose} position="right" size="min(100vw, 60rem)">
      <Drawer.Overlay backgroundOpacity={0.35} blur={3} />
      <Drawer.Content className={styles.drawer}>
        <Drawer.Header className={styles.header}>
          <Group gap={4} wrap="nowrap">
            <IconAction label="Tour précédent" disabled={index <= 0} onClick={() => selectIndex(index - 1)}>
              <IconChevronLeft size={16} aria-hidden="true" />
            </IconAction>
            <Drawer.Title fw={700}>Tour {index + 1} / {turnIds.length}</Drawer.Title>
            <IconAction label="Tour suivant" disabled={index >= turnIds.length - 1} onClick={() => selectIndex(index + 1)}>
              <IconChevronRight size={16} aria-hidden="true" />
            </IconAction>
          </Group>
          <Drawer.CloseButton aria-label="Fermer le détail du tour" />
        </Drawer.Header>
        <Drawer.Body className={styles.body}>
          <Stack gap="sm">
            {metricsError && (
              <Alert color="yellow" title="Indicateurs du récit indisponibles" role="alert">
                <Group justify="space-between" gap="xs">
                  <Text size="sm">{metricsError}</Text>
                  <Button size="compact-sm" variant="light" leftSection={<IconRefresh size={14} />} onClick={onRetryMetrics}>
                    Réessayer
                  </Button>
                </Group>
              </Alert>
            )}
            <Tabs value={tab} onChange={(value) => { if (isTurnDrawerTab(value)) setTab(value); }} keepMounted={false}
              classNames={{ root: styles.tabs, list: styles.drawerTabList }}>
              <Tabs.List>
                {turnDrawerTabs.map(({ value, label }) => <Tabs.Tab key={value} value={value}>{label}</Tabs.Tab>)}
              </Tabs.List>
              <Tabs.Panel value="overview">
                <WithSummary state={summary}>
                  {(loaded) => <TurnOverview summary={loaded} metrics={alignedMetrics} index={index} onOpenTab={setTab} />}
                </WithSummary>
              </Tabs.Panel>
              <Tabs.Panel value="context">
                <WithSummary state={summary}>
                  {(loaded) => <TurnContextPanel calls={loaded.calls} metrics={alignedMetrics} index={index} onSelectTurn={selectIndex} />}
                </WithSummary>
              </Tabs.Panel>
              <Tabs.Panel value="cost">
                <WithSummary state={summary}>{(loaded) => <TurnCostPanel summary={loaded} />}</WithSummary>
              </Tabs.Panel>
              <Tabs.Panel value="configuration">
                <WithSummary state={summary}>
                  {(loaded) => (
                    <TurnConfigurationPanel configuration={loaded.configuration} turnNumber={index + 1}
                      changes={alignedMetrics ? alignedMetrics[index]?.configurationChanges : undefined} />
                  )}
                </WithSummary>
              </Tabs.Panel>
              <Tabs.Panel value="memory">
                <MemoryTracePanel key={turnId} projectId={projectId} turnId={turnId} />
              </Tabs.Panel>
              <Tabs.Panel value="story">
                {alignedMetrics
                  ? <StoryPanel metrics={alignedMetrics} index={index} onSelectTurn={selectIndex} />
                  : !metricsError && <Loader color="choral" aria-label="Chargement des indicateurs du récit" />}
              </Tabs.Panel>
              <Tabs.Panel value="calls">
                <WithSummary state={summary}>
                  {(loaded) => <TraceCallsPanel key={turnId} projectId={projectId} turnId={turnId} calls={loaded.calls} />}
                </WithSummary>
              </Tabs.Panel>
            </Tabs>
          </Stack>
        </Drawer.Body>
      </Drawer.Content>
    </Drawer.Root>
  );
}

type SummaryState = { summary: TurnTraceSummary | null; loading: boolean; error: string; retry: () => void };

function useTurnTraceSummary(projectId: string, turnId: string): SummaryState {
  const [summary, setSummary] = useState<TurnTraceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setSummary(null);
    void getTurnTraceSummary(projectId, turnId, controller.signal).then(setSummary).catch((loadError: unknown) => {
      if (!controller.signal.aborted) setError(getErrorMessage(loadError));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [projectId, turnId, revision]);

  return { summary, loading, error, retry: () => setRevision((value) => value + 1) };
}

function WithSummary({ state, children }: { state: SummaryState; children: (summary: TurnTraceSummary) => ReactNode }) {
  if (state.loading) return <Loader color="choral" aria-label="Chargement du tour" />;
  if (state.error) {
    return (
      <Alert color="red" title="Impossible de charger le tour" role="alert">
        <Stack gap="sm">
          <Text>{state.error}</Text>
          <Button variant="light" w="fit-content" leftSection={<IconRefresh size={16} />} onClick={state.retry}>
            Réessayer
          </Button>
        </Stack>
      </Alert>
    );
  }
  if (!state.summary) return <Text c="dimmed">Aucune trace disponible pour ce tour.</Text>;
  return children(state.summary);
}
