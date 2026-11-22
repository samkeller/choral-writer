import { SimpleGrid, Stack, Text } from '@mantine/core';
import type { TurnMetrics } from '@choral-writer/shared';

import { formatCost, formatSeconds, formatUsd } from '../turnFormat';
import { DrawerBlock } from './DrawerBlock';
import { EvolutionBars } from './EvolutionBars';
import { averageCompleteCost } from './turnInsights';

/** « Récit » : the whole branch at a glance, to place the current turn in it. */
export function StoryPanel({ metrics, index, onSelectTurn }: {
  metrics: TurnMetrics[];
  index: number;
  onSelectTurn: (index: number) => void;
}) {
  const totalCost = {
    microUsd: metrics.reduce((sum, turn) => sum + turn.cost.microUsd, 0),
    complete: metrics.every((turn) => turn.cost.complete),
  };
  const averageCost = averageCompleteCost(metrics);
  const averageDuration = metrics.reduce((sum, turn) => sum + turn.durationMs, 0) / Math.max(1, metrics.length);

  return (
    <Stack gap="sm">
      <DrawerBlock title={`Récit · ${metrics.length} tour(s)`}>
        <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="xs">
          <Figure label="coût total" value={formatCost(totalCost)} />
          <Figure label="coût moyen d’un tour" value={averageCost === null ? '—' : formatUsd(averageCost)} />
          <Figure label="durée moyenne d’un tour" value={formatSeconds(averageDuration)} />
        </SimpleGrid>
      </DrawerBlock>
      <DrawerBlock title="Coût au fil des tours">
        <EvolutionBars values={metrics.map((turn) => turn.cost.microUsd)} current={index} color="yellow.7"
          onSelect={onSelectTurn}
          describe={(_, turnNumber) => `Tour ${turnNumber} : ${formatCost(metrics[turnNumber - 1]!.cost)}`} />
      </DrawerBlock>
      <DrawerBlock title="Durée au fil des tours">
        <EvolutionBars values={metrics.map((turn) => turn.durationMs)} current={index} color="choral.7"
          onSelect={onSelectTurn}
          describe={(durationMs, turnNumber) => `Tour ${turnNumber} : ${formatSeconds(durationMs ?? 0)}`} />
      </DrawerBlock>
    </Stack>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap={0}>
      <Text size="lg" fw={700}>{value}</Text>
      <Text size="xs" c="dimmed">{label}</Text>
    </Stack>
  );
}
