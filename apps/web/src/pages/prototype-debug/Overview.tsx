// PROTOTYPE — onglet « Synthèse » du tiroir : l'essentiel d'un tour, et un lien vers l'onglet qui le détaille.
import type { ReactNode } from 'react';
import { Anchor, Box, Group, Paper, SimpleGrid, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { IconAdjustments, IconAlertTriangle, IconArrowRight, IconCoin, IconCompass, IconStack2 } from '@tabler/icons-react';

import { Block, WhatHappenedBlock, analysisCounts } from './DebugBlocks';
import { type DebugTurn, type Phase, phaseColor, seconds, tensionLevels, tokens, totalInput, usd } from './fixtures';

export type DebugTab = 'overview' | 'analysis' | 'context' | 'cost' | 'direction' | 'config' | 'story' | 'raw';

const narratorInput = (turn: DebugTurn) => turn.calls.find((call) => call.label === 'Narrateur')!;

function percentDelta(value: number, reference: number) {
  const delta = Math.round(((value - reference) / reference) * 100);
  return `${delta >= 0 ? '+' : ''}${delta} %`;
}

export function Overview({ turns, index, onOpenTab }: { turns: DebugTurn[]; index: number; onOpenTab: (tab: DebugTab) => void }) {
  const turn = turns[index];
  const previous = index > 0 ? turns[index - 1] : null;
  const averageCost = turns.reduce((sum, item) => sum + item.costUsd, 0) / turns.length;
  const narrator = narratorInput(turn);
  const narratorTotal = totalInput(narrator);
  const historyShare = (narrator.input.Historique ?? 0) / narratorTotal;

  return (
    <Stack gap="sm">
      <SimpleGrid cols={4} spacing="xs">
        <Stat label="Coût" value={usd(turn.costUsd)} hint={`${percentDelta(turn.costUsd, averageCost)} vs moyenne`} onClick={() => onOpenTab('cost')} />
        <Stat label="Durée" value={seconds(turn.durationMs)} hint={`Narrateur : ${seconds(narrator.durationMs)}`} onClick={() => onOpenTab('cost')} />
        <Stat label="Entrée du Narrateur" value={`${tokens(narratorTotal)} tokens`}
          hint={previous ? `${percentDelta(narratorTotal, totalInput(narratorInput(previous)))} vs tour précédent` : 'premier tour'}
          onClick={() => onOpenTab('context')} />
        <Stat label="Tension visée"
          value={turn.direction ? tensionLevels[turn.direction.tension.target] : 'sans Directeur'}
          hint={turn.direction ? tensionHint(turn.direction.tension.previous, turn.direction.tension.target) : 'aucune cible fixée'}
          onClick={() => onOpenTab('direction')} />
      </SimpleGrid>

      <WhatHappenedBlock turn={turn} />

      <AnalysisFunnel turn={turn} onOpen={() => onOpenTab('analysis')} />

      <Block title="Points d’attention">
        <Stack gap={6}>
          {historyShare > 0.5 && (
            <Signal icon={<IconStack2 size={16} />} color="orange" tab="context" onOpenTab={onOpenTab}>
              L’historique pèse {Math.round(historyShare * 100)} % de l’entrée du Narrateur ({tokens(narrator.input.Historique ?? 0)} tokens).
            </Signal>
          )}
          {turn.costUsd > averageCost * 1.2 && (
            <Signal icon={<IconCoin size={16} />} color="yellow" tab="cost" onOpenTab={onOpenTab}>
              Tour plus cher que la moyenne du récit ({percentDelta(turn.costUsd, averageCost)}).
            </Signal>
          )}
          {turn.direction?.nudges.map((nudge) => (
            <Signal key={nudge.type} icon={<IconCompass size={16} />} color="indigo" tab="direction" onOpenTab={onOpenTab}>
              Le Directeur pousse vers <b>{nudge.type}</b> : {nudge.basis.toLowerCase()}.
            </Signal>
          ))}
          {turn.thwarted && (
            <Signal icon={<IconAlertTriangle size={16} />} color="red" tab="direction" onOpenTab={onOpenTab}>
              Une tentative du protagoniste a été contrariée.
            </Signal>
          )}
          {!turn.direction && (
            <Signal icon={<IconCompass size={16} />} color="gray" tab="direction" onOpenTab={onOpenTab}>
              Directeur désactivé : toutes les contributions sont passées au Narrateur.
            </Signal>
          )}
          {turn.configChanges.length > 0 && (
            <Signal icon={<IconAdjustments size={16} />} color="blue" tab="config" onOpenTab={onOpenTab}>
              Configuration modifiée depuis le tour précédent : {turn.configChanges.map((change) => change.label).join(', ')}.
            </Signal>
          )}
        </Stack>
      </Block>

      <Block title="Déroulé du tour" aside={<Anchor size="xs" onClick={() => onOpenTab('cost')}>Coût et durée par appel →</Anchor>}>
        <PipelineStrip turn={turn} />
      </Block>
    </Stack>
  );
}

function Stat({ label, value, hint, onClick }: { label: string; value: string; hint: string; onClick: () => void }) {
  return (
    <UnstyledButton onClick={onClick}>
      <Paper withBorder p="xs" radius="md" bg="dark.7" style={{ height: '100%' }}>
        <Text size="xs" c="dimmed">{label}</Text>
        <Text size="lg" fw={700} lh={1.3}>{value}</Text>
        <Text size="xs" c="dimmed">{hint}</Text>
      </Paper>
    </UnstyledButton>
  );
}

function Signal({ icon, color, tab, onOpenTab, children }: {
  icon: ReactNode; color: string; tab: DebugTab; onOpenTab: (tab: DebugTab) => void; children: ReactNode;
}) {
  return (
    <Group gap="xs" wrap="nowrap" align="flex-start">
      <Box c={`${color}.4`} pt={2}>{icon}</Box>
      <Text size="sm" style={{ flex: 1 }}>{children}</Text>
      <Anchor size="xs" onClick={() => onOpenTab(tab)} style={{ whiteSpace: 'nowrap' }}>Voir <IconArrowRight size={12} /></Anchor>
    </Group>
  );
}

/** Les phases dans l'ordre, chacune large comme sa durée ; l'analyse tourne en parallèle, on prend l'agent le plus lent. */
function PipelineStrip({ turn }: { turn: DebugTurn }) {
  const order: Phase[] = ['Analyse', 'Direction', 'Narrateur', 'Gardien', 'Mémoire'];
  const phases = order.map((phase) => {
    const calls = turn.calls.filter((call) => call.phase === phase);
    return { phase, durationMs: calls.length ? Math.max(...calls.map((call) => call.durationMs)) : 0, calls: calls.length };
  }).filter((phase) => phase.calls > 0);
  const total = phases.reduce((sum, phase) => sum + phase.durationMs, 0);
  return (
    <Group gap={2} wrap="nowrap">
      {phases.map(({ phase, durationMs, calls }) => (
        <Tooltip key={phase} label={`${phase} : ${seconds(durationMs)}${calls > 1 ? ` (${calls} agents en parallèle)` : ''}`}>
          <Box bg={phaseColor[phase]} px={6} py={4} style={{ flex: durationMs / total, minWidth: 48, borderRadius: 4, overflow: 'hidden' }}>
            <Text size="xs" fw={600} c="white" truncate>{phase}</Text>
            <Text size="xs" c="gray.3">{seconds(durationMs)}</Text>
          </Box>
        </Tooltip>
      ))}
    </Group>
  );
}

function tensionHint(previous: number, target: number) {
  if (target > previous) return `en hausse, depuis ${tensionLevels[previous]}`;
  if (target < previous) return `en baisse, depuis ${tensionLevels[previous]}`;
  return 'stable';
}

/** Des items produits par l'analyse à ceux qui se retrouvent dans la prose. */
function AnalysisFunnel({ turn, onOpen }: { turn: DebugTurn; onOpen: () => void }) {
  const counts = analysisCounts(turn);
  const step = (value: number, label: string, color: string) => (
    <Stack gap={0} align="center" style={{ flex: 1 }}>
      <Text size="xl" fw={700} c={color}>{value}</Text>
      <Text size="xs" c="dimmed" ta="center">{label}</Text>
    </Stack>
  );
  const arrow = <IconArrowRight size={16} color="var(--mantine-color-dark-2)" />;
  return (
    <Block title="De l’analyse à la prose" aside={<Anchor size="xs" onClick={onOpen}>Détail par agent →</Anchor>}>
      <UnstyledButton onClick={onOpen} w="100%">
        <Group gap="xs" wrap="nowrap">
          {step(counts.produced, `items produits par ${turn.analysis.length} agents`, 'blue.4')}
          {arrow}
          {step(counts.transmitted, 'transmis par le Directeur', 'indigo.3')}
          {arrow}
          {step(counts.inProse, 'visibles dans la prose', 'violet.3')}
          {counts.offscreen > 0 && <>{arrow}{step(counts.offscreen, 'hors champ, connus du Gardien', 'teal.4')}</>}
        </Group>
      </UnstyledButton>
    </Block>
  );
}
