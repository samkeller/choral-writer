import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Center, Group, Loader, Modal, Stack, Tabs, Text } from '@mantine/core';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { IconArrowLeft, IconRefresh } from '@tabler/icons-react';
import { projectParamsSchema } from '@choral-writer/shared';

import { PageHeader } from '../components/PageHeader';
import { BranchSwitcher } from '../components/chat/BranchSwitcher';
import { MessageComposer } from '../components/chat/MessageComposer';
import { MessageList } from '../components/chat/MessageList';
import { PipelineFailure } from '../components/chat/PipelineProgress';
import { TurnDrawer } from '../components/chat/turnDrawer/TurnDrawer';
import { ProjectConfiguration } from './ProjectConfiguration';
import { useChat } from '../hooks/useChat';
import { useTurnMetrics } from '../hooks/useTurnMetrics';
import { NotFoundPage } from './NotFoundPage';
import { IconAction } from '../components/atoms/IconAction';
import styles from './ChatPage.module.css';

export function ChatPage() {
  const params = projectParamsSchema.safeParse(useParams());
  if (!params.success) return <NotFoundPage />;
  return <ProjectChat key={params.data.projectId} projectId={params.data.projectId} />;
}

function ProjectChat({ projectId }: { projectId: string }) {
  const [search, setSearch] = useSearchParams();
  const chat = useChat(projectId);
  const setupOpen = !chat.pending && (search.get('tab') === 'config' || search.get('setup') === 'agents');
  const head = chat.history?.turns.at(-1);
  const [traceTurnId, setTraceTurnId] = useState<string | null>(null);
  const turnMetrics = useTurnMetrics(projectId, chat.history);
  const metricsByTurn = useMemo(
    () => new Map((turnMetrics.metrics ?? []).map((metrics) => [metrics.turnId, metrics])),
    [turnMetrics.metrics],
  );

  useEffect(() => setTraceTurnId(null), [chat.history?.branch.id]);

  if (chat.loading) {
    return <Center py="xl"><Loader color="choral" aria-label="Chargement de la conversation" /></Center>;
  }

  return (
    <Stack gap="xs" mx="auto" w="100%" className={styles.page}>
      <PageHeader
        title={chat.project?.name ?? 'Conversation'}
        actions={<Group gap="xs">
          <BranchSwitcher branches={chat.branches} currentId={chat.history?.branch.id ?? null}
            disabled={chat.pending || !chat.history} onChange={chat.selectBranch} />
          <IconAction component={Link} to="/projects" label="Tous les projets">
            <IconArrowLeft size={18} aria-hidden="true" />
          </IconAction>
        </Group>}
      />
      <Tabs value={setupOpen ? 'config' : 'story'} onChange={(value) => {
        if (chat.pending) return;
        setSearch((current) => {
          const next = new URLSearchParams(current);
          if (value === 'config') next.set('tab', 'config'); else next.delete('tab');
          next.delete('setup'); next.delete('agentVersion'); next.delete('section');
          return next;
        });
      }}>
        <Tabs.List>
          <Tabs.Tab value="story" disabled={chat.pending}>Récit</Tabs.Tab>
          <Tabs.Tab value="config" disabled={chat.pending}>Configuration</Tabs.Tab></Tabs.List>
      </Tabs>
      {chat.error && (
        <Alert color="red" title="Conversation" role="alert">
          <Stack gap="sm">
            <Text>{chat.error}</Text>
            {chat.failedBranchId && (
              <Button variant="light" onClick={() => {
                if (chat.failedBranchId) chat.selectBranch(chat.failedBranchId);
              }}>
                Ouvrir l’alternative échouée
              </Button>
            )}
            {!chat.pending && (
              <Button variant="subtle" w="fit-content" onClick={chat.reload}>Recharger l’historique</Button>
            )}
          </Stack>
        </Alert>
      )}
      {chat.project && (
        <>
          {setupOpen && <ProjectConfiguration project={chat.project}
            branchId={chat.history?.branch.id ?? search.get('branch')} selectBranch={chat.selectBranch}
            suggestedVersion={search.get('agentVersion')}
            initialSection={search.get('section') === 'memory' ? 'memory' : search.get('section') === 'agents' || search.get('setup') === 'agents' ? 'agents' : 'project'}
            onProjectSaved={chat.reload} />}
          <Stack className={styles.story} gap="xs" style={{ display: setupOpen ? 'none' : undefined, flex: 1, minHeight: 0 }}>
          <Box className={styles.conversation}>
            <MessageList
              messages={chat.messages}
              turns={chat.history?.turns ?? []}
              partial={chat.partial}
              pending={chat.pending}
              pipelineProgress={chat.pipelineProgress}
              turnMetrics={metricsByTurn}
              inspectedTurnId={traceTurnId}
              onInspectTurn={setTraceTurnId}
            />
          </Box>
          {head?.status === 'failed' && !chat.pending
            && <PipelineFailure error={head.error} disabled={chat.pending} onRetry={() => void chat.retry()} />}
          {head?.memory?.status === 'failed' && !chat.pending && <Alert color="yellow" title="Mémoire à relancer">
            <Text size="sm">{head.memory.message}</Text>
            <Group gap="xs" mt="xs">
              <Button onClick={() => void chat.retryMemory()} variant="light" size="compact-sm">Relancer le Gardien</Button>
              <Button onClick={() => setSearch((current) => { const next = new URLSearchParams(current); next.set('tab', 'config'); next.set('section', 'memory'); return next; })}
                variant="subtle" size="compact-sm">Corriger la mémoire</Button>
            </Group>
          </Alert>}
          <MessageComposer pending={chat.pending} onSend={chat.send} actions={head && (
            <Group justify="flex-end" gap={4} wrap="nowrap">
              {head.status === 'completed' && (
                <IconAction label="Régénérer la réponse" disabled={chat.pending} onClick={() => void chat.regenerate()}>
                  <IconRefresh size={18} aria-hidden="true" />
                </IconAction>
              )}

              {head.status === 'failed' && (
                <>
                  <IconAction label="Réessayer la réponse" color="red" disabled={chat.pending} onClick={() => void chat.retry()}>
                    <IconRefresh size={18} aria-hidden="true" />
                  </IconAction>
                </>
              )}
            </Group>
          )} />
          </Stack>
          {traceTurnId && (
            <TurnDrawer
              projectId={projectId}
              turnIds={chat.history?.turns.map((turn) => turn.id) ?? []}
              metrics={turnMetrics.metrics}
              metricsError={turnMetrics.error}
              onRetryMetrics={turnMetrics.reload}
              turnId={traceTurnId}
              onSelectTurn={setTraceTurnId}
              onClose={() => setTraceTurnId(null)}
            />
          )}
          <Modal opened={chat.legacyMemoryConfirmation} onClose={chat.cancelLegacyMemoryReset} title="Ancien tour sans état mémoire">
            <Text mb="md">Ce tour précède M6. Cette alternative repartira sans les entrées ajoutées depuis.
              La branche actuelle restera intacte.</Text>
            <Group justify="flex-end">
              <Button variant="subtle" onClick={chat.cancelLegacyMemoryReset}>Annuler</Button>
              <Button onClick={chat.confirmLegacyMemoryReset}>Créer l’alternative sans mémoire</Button>
            </Group>
          </Modal>
        </>
      )}
    </Stack>
  );
}
