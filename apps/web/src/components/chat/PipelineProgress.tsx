import { Badge, Group, Loader, Paper, Progress, Stack, Text } from '@mantine/core';

import type { ChatPipelineProgress } from '../../hooks/useChat';

interface PipelineProgressProps {
  progress: ChatPipelineProgress;
}

export function PipelineProgress({ progress }: PipelineProgressProps) {
  const completedAgents = Object.values(progress.analysis.agents)
    .filter((agent) => agent.status === 'completed' || agent.status === 'failed').length;
  const currentStep = progress.activeStage === 'analysis' ? progress.analysis : progress.narrator;
  const stageLabel = progress.activeStage === 'analysis' ? 'Analyse' : 'Narrateur';
  const elapsed = `${(currentStep.elapsedMs / 1000).toFixed(1)} s`;
  const progressValue = progress.activeStage === 'analysis' && progress.analysis.agentCount > 0
    ? Math.round((completedAgents / progress.analysis.agentCount) * 100)
    : undefined;

  return (
    <Paper p="sm" withBorder bg="dark.7" role="status" aria-live="off">
      <Stack gap="xs">
        <Group gap="sm" wrap="nowrap">
          <Loader size="xs" color="choral.3" aria-hidden="true" />
          <Stack gap={0} style={{ flex: 1 }}>
            <Text size="sm" fw={600} aria-live="polite">
              {stageLabel} en cours
            </Text>
            <Text size="xs" c="dimmed">
              {progress.activeStage === 'analysis'
                ? progress.analysis.agentCount > 0
                  ? `${completedAgents}/${progress.analysis.agentCount} agents · ${elapsed}`
                  : `Aucun agent configuré · ${elapsed}`
                : elapsed}
            </Text>
          </Stack>
        </Group>
        {progressValue !== undefined && <Progress value={progressValue} size="xs" color="blue" />}
        {progress.activeStage === 'analysis' && (
          <Stack gap={4}>
            {Object.entries(progress.analysis.agents).map(([agentId, agent]) => {
              const durationMs = agent.durationMs
                ?? (agent.startedAt === null ? 0 : Date.now() - agent.startedAt);
              return (
                <Group key={agentId} justify="space-between" gap="xs">
                  <Group gap="xs">
                    {agent.status === 'started' ? (
                      <Loader size={12} color="blue" aria-label={`Agent ${agent.name} en cours`} />
                    ) : (
                      <Badge size="xs" variant="light" color={agent.status === 'completed' ? 'green' : 'red'}>
                        {agent.status === 'completed' ? 'Terminé' : 'Échec'}
                      </Badge>
                    )}
                    <Text size="xs">{agent.name}</Text>
                  </Group>
                  <Text size="xs" c="dimmed">{(durationMs / 1000).toFixed(1)} s</Text>
                </Group>
              );
            })}
          </Stack>
        )}
        <Group justify="space-between" gap="xs">
          <PipelineStep
            label="Analyse"
            status={progress.analysis.status}
            duration={progress.analysis.elapsedMs}
            active={progress.activeStage === 'analysis'}
          />
          <PipelineStep
            label="Narrateur"
            status={progress.narrator.status}
            duration={progress.narrator.elapsedMs}
            active={progress.activeStage === 'narrator'}
          />
        </Group>
      </Stack>
    </Paper>
  );
}

function PipelineStep({
  label, status, duration, active,
}: {
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  duration: number;
  active: boolean;
}) {
  const color = status === 'completed' ? 'green' : status === 'failed' ? 'red' : active ? 'choral' : 'gray';
  const text = status === 'pending'
    ? 'En attente'
    : status === 'running'
      ? `${(duration / 1000).toFixed(1)} s`
      : `${(duration / 1000).toFixed(1)} s`;

  return (
    <Group gap={4}>
      <Badge size="xs" variant="light" color={color}>{label}</Badge>
      <Text size="xs" c="dimmed">{text}</Text>
    </Group>
  );
}
