import { Box, Button, Group, Loader, Text } from '@mantine/core';
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react';

import type { ChatPipelineProgress } from '../../hooks/useChat';
import { pipelineStages, stagePresentation } from '../phases/stagePresentation';
import { formatSeconds } from './turnFormat';

/** The only feedback during a turn: one line with the current stage, its duration and a segment per stage. */
export function PipelineProgress({ progress }: { progress: ChatPipelineProgress }) {
  const stage = progress.activeStage ?? 'analysis';
  const { agents, agentCount } = progress.analysis;
  const finishedAgents = Object.values(agents).filter((agent) => agent.status !== 'started').length;
  const agentDetail = stage === 'analysis' && agentCount > 0 ? ` · ${finishedAgents}/${agentCount} agents` : '';
  const stages = progress.memoryOnly
    ? pipelineStages.filter((item) => item === 'guardian' || item === 'reducer')
    : pipelineStages;

  return (
    <Group gap="xs" wrap="nowrap" py={4} role="status" aria-live="off">
      <Loader size={12} color="choral.3" aria-hidden="true" />
      <Text size="xs" c="dimmed" aria-live="polite" truncate>
        {progress.memoryOnly ? 'Mémoire' : stagePresentation[stage].label}{agentDetail} · {formatSeconds(progress[stage].elapsedMs)}
      </Text>
      <Group gap={2} wrap="nowrap" w={120} style={{ flexShrink: 0 }} aria-hidden="true">
        {stages.map((item) => {
          const status = progress[item].status;
          const reached = status === 'completed' || status === 'running';
          return (
            <Box key={item} h={3} style={{ flex: 1, borderRadius: 2 }}
              bg={status === 'failed' ? 'red.6' : reached ? stagePresentation[item].color : 'dark.4'}
              opacity={status === 'running' ? 0.6 : 1} />
          );
        })}
      </Group>
    </Group>
  );
}

/** Replaces the progress line when the last turn failed. */
export function PipelineFailure({ error, disabled, onRetry }: {
  error: string | null;
  disabled: boolean;
  onRetry: () => void;
}) {
  return (
    <Group gap="xs" wrap="nowrap" py={4} role="alert">
      <IconAlertTriangle size={14} color="var(--mantine-color-red-5)" aria-hidden="true" style={{ flexShrink: 0 }} />
      <Text size="xs" c="red.4" style={{ flex: 1, minWidth: 0 }}>
        Échec du tour{error ? ` : ${error}` : ''}
      </Text>
      <Button size="compact-xs" variant="light" color="red" leftSection={<IconRefresh size={12} aria-hidden="true" />}
        disabled={disabled} onClick={onRetry}>
        Réessayer
      </Button>
    </Group>
  );
}
