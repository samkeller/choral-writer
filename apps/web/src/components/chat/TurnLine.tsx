import { Button, Group, Text, UnstyledButton } from '@mantine/core';
import { IconChevronRight, IconColumns } from '@tabler/icons-react';
import type { TurnMetrics } from '@choral-writer/shared';

import { formatCost, formatSeconds } from './turnFormat';

/**
 * The discreet line under a turn: duration and cost, always clickable to open the turn drawer. A variant of a turn
 * also offers to compare it with the version it was regenerated from.
 */
export function TurnLine({ turnNumber, metrics, failed, selected, onOpen, onCompare }: {
  turnNumber: number;
  metrics: TurnMetrics | undefined;
  failed: boolean;
  selected: boolean;
  onOpen: () => void;
  onCompare?: () => void;
}) {
  const parts = [
    ...(failed ? ['échec'] : []),
    ...(metrics ? [formatSeconds(metrics.durationMs), formatCost(metrics.cost)] : ['détail du tour']),
    ...(metrics?.configurationChanges?.length ? ['config modifiée'] : []),
  ];

  const line = (
    <UnstyledButton onClick={onOpen} py={2} px={6} aria-current={selected || undefined}
      aria-label={`Tour ${turnNumber} : ${parts.join(' · ')}`}
      bg={selected ? 'dark.5' : undefined} style={{ borderRadius: 4 }}>
      <Group gap={6} wrap="nowrap">
        <Text size="xs" c={failed ? 'red.4' : 'dark.2'}>{parts.join(' · ')}</Text>
        <IconChevronRight size={12} color="var(--mantine-color-dark-2)" aria-hidden="true" />
      </Group>
    </UnstyledButton>
  );
  if (!onCompare) return line;
  return (
    <Group gap={4} wrap="nowrap">
      {line}
      <Button size="compact-xs" variant="subtle" color="gray" leftSection={<IconColumns size={12} aria-hidden="true" />}
        onClick={onCompare}>
        Comparer avec l’original
      </Button>
    </Group>
  );
}
