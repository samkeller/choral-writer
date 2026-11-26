import { SimpleGrid, Stack, Text } from '@mantine/core';
import type { TurnMetrics } from '@choral-writer/shared';

import { phasePresentation } from '../../phases/phasePresentation';
import { formatCost, formatSeconds, formatUsd } from '../turnFormat';
import { DrawerBlock } from './DrawerBlock';
import { EvolutionBars } from './EvolutionBars';
import { type StoryDirectionRates, estimateTensionLevels, storyDirectionRates, tensionScale } from './directionInsights';
import { EstimateHint } from './DirectionPanel';
import { tensionMoveLabels } from './directionPresentation';
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
  const directionRates = storyDirectionRates(metrics);

  return (
    <Stack gap="sm">
      <DrawerBlock title={`Récit · ${metrics.length} tour(s)`}>
        <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="xs">
          <Figure label="coût total" value={formatCost(totalCost)} />
          <Figure label="coût moyen d’un tour" value={averageCost === null ? '—' : formatUsd(averageCost)} />
          <Figure label="durée moyenne d’un tour" value={formatSeconds(averageDuration)} />
        </SimpleGrid>
      </DrawerBlock>
      {directionRates && <StoryDirection metrics={metrics} rates={directionRates} index={index} onSelectTurn={onSelectTurn} />}
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

function StoryDirection({ metrics, rates, index, onSelectTurn }: {
  metrics: TurnMetrics[];
  rates: StoryDirectionRates;
  index: number;
  onSelectTurn: (index: number) => void;
}) {
  // A bar per directed turn only: the estimated level of an undirected turn is a carry-over, not a decision.
  const values = estimateTensionLevels(metrics)
    .map(({ current }, position) => (metrics[position]?.direction?.status === 'success' ? current + 1 : null));
  return (
    <DrawerBlock title={`Direction · ${rates.directedTurns} tour(s) dirigé(s)`}>
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="xs">
          <Figure label="des tours dirigés avec au moins une intervention" value={formatShare(rates.nudgeShare)} />
          <Figure label="des tours dirigés où le Directeur pousse une complication" value={formatShare(rates.complicationShare)} />
        </SimpleGrid>
        <Stack gap={4}>
          <EstimateHint label="Niveau de tension estimé au fil des tours" />
          <EvolutionBars values={values} current={index} color={`${phasePresentation.direction.color}.7`} height={56}
            scaleMax={tensionScale.length} onSelect={onSelectTurn}
            describe={(value, turnNumber) => (value === null
              ? `Tour ${turnNumber} : sans direction`
              : `Tour ${turnNumber} : tension ${directionLabel(metrics[turnNumber - 1])}, niveau estimé ${tensionScale[value - 1]}`)} />
        </Stack>
      </Stack>
    </DrawerBlock>
  );
}

function directionLabel(turn: TurnMetrics | undefined): string {
  return turn?.direction?.status === 'success' ? tensionMoveLabels[turn.direction.tension] : '—';
}

function formatShare(share: number): string {
  return `${Math.round(share * 100)} %`;
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap={0}>
      <Text size="lg" fw={700}>{value}</Text>
      <Text size="xs" c="dimmed">{label}</Text>
    </Stack>
  );
}
