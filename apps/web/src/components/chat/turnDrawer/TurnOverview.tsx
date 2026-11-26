import type { ReactNode } from 'react';
import { Anchor, Box, Group, Paper, SimpleGrid, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import {
  IconAdjustments, IconAlertTriangle, IconArrowRight, IconCoin, IconCompass, IconStack2,
} from '@tabler/icons-react';
import type { DirectionTrace, TurnMetrics, TurnTraceSummary } from '@choral-writer/shared';

import { phasePresentation } from '../../phases/phasePresentation';
import { formatCost, formatDelta, formatSeconds, formatTokens, formatUsd } from '../turnFormat';
import { DrawerBlock } from './DrawerBlock';
import { configurationChangeLabel } from './TurnConfigurationPanel';
import { type TensionLevels, tensionScale } from './directionInsights';
import { TENSION_ESTIMATE_HINT, nudgeDescriptions, tensionMoveLabels } from './directionPresentation';
import { TurnTimeline } from './TurnTimeline';
import type { TurnDrawerTab } from './turnDrawerTabs';
import { type AttentionPoint, attentionPoints, averageCompleteCost } from './turnInsights';

/** « Synthèse » : the essentials of a turn, each leading to the tab that details it. */
export function TurnOverview({ summary, metrics, index, tensionLevels, onOpenTab, onOpenCall }: {
  summary: TurnTraceSummary;
  metrics: TurnMetrics[] | null;
  index: number;
  tensionLevels: TensionLevels | null;
  onOpenTab: (tab: TurnDrawerTab) => void;
  onOpenCall: (callId: string) => void;
}) {
  const turn = metrics?.[index];
  const previous = index > 0 ? metrics?.[index - 1] : undefined;
  const average = metrics ? averageCompleteCost(metrics) : null;
  const narratorStage = summary.timeline.find((stage) => stage.stage === 'narrator');
  const narratorTokens = turn?.narratorInputTokens ?? null;
  const previousTokens = previous?.narratorInputTokens ?? null;
  const points = attentionPoints(summary, metrics ?? [], index);

  return (
    <Stack gap="sm">
      <SimpleGrid cols={summary.direction ? { base: 1, xs: 2, sm: 4 } : { base: 1, xs: 3 }} spacing="xs">
        <Indicator label="Coût" value={formatCost(summary.cost)} onClick={() => onOpenTab('cost')}
          hint={summary.cost.complete && average ? `${formatDelta(summary.cost.microUsd, average)} vs moyenne du récit` : 'pas de moyenne comparable'} />
        <Indicator label="Durée" value={formatSeconds(summary.durationMs)} onClick={() => onOpenTab('cost')}
          hint={narratorStage ? `Narrateur : ${formatSeconds(narratorStage.durationMs)}` : 'sans appel du Narrateur'} />
        <Indicator label="Entrée du Narrateur" onClick={() => onOpenTab('context')}
          value={narratorTokens === null ? '—' : `${formatTokens(narratorTokens)} tokens`}
          hint={index === 0 ? 'premier tour'
            : narratorTokens !== null && previousTokens ? `${formatDelta(narratorTokens, previousTokens)} vs tour précédent`
              : 'pas de tour précédent comparable'} />
        {summary.direction && (
          <Indicator label="Tension" onClick={() => onOpenTab('direction')}
            {...describeTension(summary.direction, tensionLevels)} />
        )}
      </SimpleGrid>

      <DrawerBlock title="Points d’attention">
        {points.length === 0
          ? <Text size="sm" c="dimmed">Rien à signaler pour ce tour.</Text>
          : (
            <Stack gap={6}>
              {points.map((point, position) => (
                <AttentionLine key={`${point.kind}-${position}`} point={point} onOpenTab={onOpenTab} onOpenCall={onOpenCall} />
              ))}
            </Stack>
          )}
      </DrawerBlock>

      <DrawerBlock title="Déroulé du tour"
        aside={<Anchor component="button" type="button" size="xs" onClick={() => onOpenTab('cost')}>Coût et durée par appel →</Anchor>}>
        <TurnTimeline timeline={summary.timeline} />
      </DrawerBlock>
    </Stack>
  );
}

/** The move the Director decided, then the estimated level, flagged as such, when the story is known. */
function describeTension(trace: DirectionTrace, levels: TensionLevels | null): { value: string; hint: string; tooltip?: string } {
  if (!trace.direction) return { value: '—', hint: 'direction en échec' };
  const value = tensionMoveLabels[trace.direction.tension];
  if (!levels) return { value, hint: 'niveau estimé indisponible' };
  return { value, hint: `niveau estimé : ${tensionScale[levels.current]}`, tooltip: TENSION_ESTIMATE_HINT };
}

function Indicator({ label, value, hint, tooltip, onClick }: {
  label: string;
  value: string;
  hint: string;
  tooltip?: string;
  onClick: () => void;
}) {
  return (
    <Tooltip label={tooltip} disabled={!tooltip} multiline w={280}>
      <UnstyledButton onClick={onClick} aria-label={`${label} : ${value}, ${hint}`}>
        <Paper withBorder p="xs" radius="md" bg="dark.7" h="100%">
          <Text size="xs" c="dimmed">{label}</Text>
          <Text size="lg" fw={700} lh={1.3}>{value}</Text>
          <Text size="xs" c="dimmed">{hint}</Text>
        </Paper>
      </UnstyledButton>
    </Tooltip>
  );
}

function AttentionLine({ point, onOpenTab, onOpenCall }: {
  point: AttentionPoint;
  onOpenTab: (tab: TurnDrawerTab) => void;
  onOpenCall: (callId: string) => void;
}) {
  const { icon, color, tab, text } = describeAttentionPoint(point);
  const callId = point.kind === 'analysisAgentWithoutEnvelope' ? point.callId : null;
  return (
    <Group gap="xs" wrap="nowrap" align="flex-start">
      <Box c={`${color}.4`} pt={2} aria-hidden="true">{icon}</Box>
      <Text size="sm" style={{ flex: 1 }}>{text}</Text>
      <Anchor component="button" type="button" size="xs" style={{ whiteSpace: 'nowrap' }} onClick={() => (callId ? onOpenCall(callId) : onOpenTab(tab))}>
        Voir <IconArrowRight size={12} aria-hidden="true" />
      </Anchor>
    </Group>
  );
}

function describeAttentionPoint(point: AttentionPoint): { icon: ReactNode; color: string; tab: TurnDrawerTab; text: string } {
  switch (point.kind) {
    case 'costAboveAverage':
      return {
        icon: <IconCoin size={16} />, color: 'yellow', tab: 'cost',
        text: `Tour plus cher que la moyenne du récit : ${formatUsd(point.microUsd)} pour ${formatUsd(point.averageMicroUsd)} en moyenne (${formatDelta(point.microUsd, point.averageMicroUsd)}).`,
      };
    case 'partialCost':
      return {
        icon: <IconCoin size={16} />, color: 'gray', tab: 'cost',
        text: 'Coût partiel : au moins un appel n’a pas de prix connu.',
      };
    case 'narratorInputGrowth':
      return {
        icon: <IconStack2 size={16} />, color: 'orange', tab: 'context',
        text: `L’entrée du Narrateur grossit : ${formatTokens(point.tokens)} tokens contre ${formatTokens(point.previousTokens)} au tour précédent (${formatDelta(point.tokens, point.previousTokens)}).`,
      };
    case 'analysisAgentWithoutEnvelope':
      return {
        icon: <IconAlertTriangle size={16} />, color: 'red', tab: 'calls',
        text: `${point.agentName} n’a produit aucune contribution valide : le Narrateur a tourné sans lui.`,
      };
    case 'failedCalls':
      return {
        icon: <IconAlertTriangle size={16} />, color: 'red', tab: 'calls',
        text: `${point.count} appel(s) en échec pendant ce tour.`,
      };
    case 'directorNudge':
      return {
        icon: <IconCompass size={16} />, color: phasePresentation.direction.color, tab: 'direction',
        text: point.type === 'complication'
          ? `Complication poussée par le Directeur, pour ${nudgeDescriptions.complication} : ${point.target}.`
          : `Le Directeur pousse vers ${point.type}, pour ${nudgeDescriptions[point.type]} : ${point.target}.`,
      };
    case 'directionFailed':
      return {
        icon: <IconAlertTriangle size={16} />, color: 'red', tab: 'direction',
        text: `Direction en échec après ${point.attempts} tentative(s) : le Narrateur a reçu le whiteboard complet.`,
      };
    case 'directorDisabled':
      return {
        icon: <IconCompass size={16} />, color: 'gray', tab: 'direction',
        text: 'Directeur désactivé depuis le tour précédent : toutes les contributions passent au Narrateur.',
      };
    case 'configurationChanged':
      return {
        icon: <IconAdjustments size={16} />, color: 'blue', tab: 'configuration',
        text: `Configuration modifiée depuis le tour précédent : ${point.changes.map(configurationChangeLabel).join(', ')}.`,
      };
  }
}
