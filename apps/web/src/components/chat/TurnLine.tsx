import { Group, Text, UnstyledButton } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import type { TurnMetrics } from '@choral-writer/shared';

import { formatCost, formatSeconds } from './turnFormat';

/** The discreet line under a turn: duration and cost, always clickable to open the turn drawer. */
export function TurnLine({ turnNumber, metrics, failed, selected, onOpen }: {
  turnNumber: number;
  metrics: TurnMetrics | undefined;
  failed: boolean;
  selected: boolean;
  onOpen: () => void;
}) {
  const parts = [
    ...(failed ? ['échec'] : []),
    ...(metrics ? [formatSeconds(metrics.durationMs), formatCost(metrics.cost)] : ['détail du tour']),
    ...(metrics?.configurationChanges?.length ? ['config modifiée'] : []),
  ];

  return (
    <UnstyledButton onClick={onOpen} py={2} px={6} aria-current={selected || undefined}
      aria-label={`Tour ${turnNumber} : ${parts.join(' · ')}`}
      bg={selected ? 'dark.5' : undefined} style={{ borderRadius: 4 }}>
      <Group gap={6} wrap="nowrap">
        <Text size="xs" c={failed ? 'red.4' : 'dark.2'}>{parts.join(' · ')}</Text>
        <IconChevronRight size={12} color="var(--mantine-color-dark-2)" aria-hidden="true" />
      </Group>
    </UnstyledButton>
  );
}
