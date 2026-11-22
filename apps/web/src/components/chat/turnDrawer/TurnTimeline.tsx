import { Box, Group, Text, Tooltip } from '@mantine/core';
import type { StageDuration } from '@choral-writer/shared';

import { stagePresentationOf } from '../../phases/stagePresentation';
import { formatSeconds } from '../turnFormat';

/** The stages of a turn in order, each as wide as its duration. */
export function TurnTimeline({ timeline }: { timeline: StageDuration[] }) {
  const total = timeline.reduce((sum, stage) => sum + stage.durationMs, 0);
  if (timeline.length === 0) return <Text size="sm" c="dimmed">Aucun appel enregistré pour ce tour.</Text>;

  return (
    <Group gap={2} wrap="nowrap">
      {timeline.map(({ stage, durationMs, agentCount }) => {
        const { label, color } = stagePresentationOf(stage);
        const parallel = agentCount > 1 ? ` (${agentCount} agents en parallèle)` : '';
        return (
          <Tooltip key={stage} label={`${label} : ${formatSeconds(durationMs)}${parallel}`}>
            <Box bg={color} px={6} py={4} miw={56}
              style={{ flex: total > 0 ? durationMs / total : 1, borderRadius: 4, overflow: 'hidden' }}>
              <Text size="xs" fw={600} c="white" truncate>{label}</Text>
              <Text size="xs" c="gray.3">{formatSeconds(durationMs)}</Text>
            </Box>
          </Tooltip>
        );
      })}
    </Group>
  );
}
