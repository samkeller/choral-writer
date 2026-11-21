// PROTOTYPE — blocs du mode Debug, partagés par les variantes A, B et C (seule la mise en page varie).
import { useEffect, useState, type ReactNode } from 'react';
import { Anchor, Badge, SegmentedControl, Box, Group, Loader, Paper, Progress, SimpleGrid, Stack, Table, Text, Tooltip, UnstyledButton } from '@mantine/core';

import {
  type AnalysisItem, type DebugTurn, type ItemKind, changeColor, tensionLevels, contextParts, costByPhase, partColor, phaseColor, seconds, storyRates, tokens,
  totalInput, usd, verdictColor,
} from './fixtures';

export function Block({ title, aside, children, dense }: { title: string; aside?: ReactNode; children: ReactNode; dense?: boolean }) {
  return (
    <Paper withBorder p={dense ? 'xs' : 'sm'} bg="dark.7" radius="md">
      <Group justify="space-between" mb="xs" gap="xs">
        <Text size="xs" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: '0.06em' }}>{title}</Text>
        {aside}
      </Group>
      {children}
    </Paper>
  );
}

const attributionCache = new Set<number>();

/** L'attribution est un petit appel LLM calculé à l'ouverture, puis mis en cache : on simule le délai. */
function useAttributionReady(turnIndex: number) {
  const [ready, setReady] = useState(attributionCache.has(turnIndex));
  useEffect(() => {
    if (attributionCache.has(turnIndex)) { setReady(true); return; }
    setReady(false);
    const timer = setTimeout(() => { attributionCache.add(turnIndex); setReady(true); }, 900);
    return () => clearTimeout(timer);
  }, [turnIndex]);
  return ready;
}

export function WhatHappenedBlock({ turn, dense }: { turn: DebugTurn; dense?: boolean }) {
  const ready = useAttributionReady(turn.index);
  return (
    <Block title="Ce qui s’est passé" dense={dense}
      aside={<Text size="xs" c="dimmed">{ready ? 'attribution en cache' : 'calcul de l’attribution…'}</Text>}>
      {!ready ? <Group gap="xs"><Loader size="xs" /><Text size="sm" c="dimmed">Petit appel LLM (≈ 0,001 $)</Text></Group> : (
        <Stack gap={6}>
          <Text size="sm" fw={600}>{turn.whatHappened}</Text>
          <Table verticalSpacing={4} horizontalSpacing="xs" fz="xs">
            <Table.Tbody>
              {turn.attribution.map((row) => (
                <Table.Tr key={row.agent}>
                  <Table.Td w={110}><Text size="xs" fw={600}>{row.agent}</Text></Table.Td>
                  <Table.Td><Text size="xs">proposait « {row.proposal} »</Text></Table.Td>
                  <Table.Td w={80}><Badge size="xs" variant="light" color={verdictColor[row.verdict]}>{row.verdict}</Badge></Table.Td>
                  <Table.Td w={170}><Text size="xs" c="dimmed">{row.why}</Text></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Stack>
      )}
    </Block>
  );
}

export function ContextLegend() {
  return (
    <Group gap={8}>
      {contextParts.map((part) => (
        <Group key={part} gap={4}><Box w={8} h={8} bg={partColor[part]} style={{ borderRadius: 2 }} /><Text size="xs" c="dimmed">{part}</Text></Group>
      ))}
    </Group>
  );
}

function StackedTokens({ input, max, height = 14 }: { input: DebugTurn['calls'][number]['input']; max: number; height?: number }) {
  return (
    <Progress.Root size={height} bg="transparent" style={{ width: `${(Object.values(input).reduce((sum, value) => sum + (value ?? 0), 0) / max) * 100}%` }}>
      {contextParts.filter((part) => input[part]).map((part) => (
        <Tooltip key={part} label={`${part} : ${tokens(input[part]!)} tokens`}>
          <Progress.Section value={(input[part]! / Object.values(input).reduce((sum, value) => sum + (value ?? 0), 0)) * 100} color={partColor[part]} />
        </Tooltip>
      ))}
    </Progress.Root>
  );
}

export function ContextBlock({ turn, dense }: { turn: DebugTurn; dense?: boolean }) {
  const max = Math.max(...turn.calls.map(totalInput));
  const narrator = turn.calls.find((call) => call.label === 'Narrateur')!;
  const historyShare = (narrator.input.Historique ?? 0) / totalInput(narrator);
  return (
    <Block title="Composition du contexte" dense={dense}
      aside={historyShare > 0.5 && <Badge size="xs" color="orange" variant="light">historique : {Math.round(historyShare * 100)} % du Narrateur</Badge>}>
      <Stack gap={6}>
        {turn.calls.map((call) => (
          <Group key={call.label} gap="xs" wrap="nowrap">
            <Text size="xs" w={90} fw={call.label === 'Narrateur' ? 700 : 400}>{call.label}</Text>
            <Box style={{ flex: 1 }}><StackedTokens input={call.input} max={max} height={call.label === 'Narrateur' ? 16 : 10} /></Box>
            <Text size="xs" c="dimmed" w={50} ta="right">{tokens(totalInput(call))}</Text>
          </Group>
        ))}
        <ContextLegend />
      </Stack>
    </Block>
  );
}

/** Entrée du Narrateur au fil des tours, en barres empilées ; le tour courant est surligné. */
export function ContextEvolution({ turns, current, onSelect, height = 90 }: {
  turns: DebugTurn[]; current: number; onSelect?: (index: number) => void; height?: number;
}) {
  const narratorInputs = turns.map((turn) => turn.calls.find((call) => call.label === 'Narrateur')!.input);
  const max = Math.max(...narratorInputs.map((input) => Object.values(input).reduce((sum, value) => sum + (value ?? 0), 0)));
  return (
    <Group gap={3} align="flex-end" h={height} wrap="nowrap">
      {narratorInputs.map((input, index) => {
        const total = Object.values(input).reduce((sum, value) => sum + (value ?? 0), 0);
        return (
          <Tooltip key={index} label={`Tour ${index + 1} : ${tokens(total)} tokens en entrée du Narrateur`}>
            <UnstyledButton onClick={() => onSelect?.(index)} style={{
              flex: 1, height: `${(total / max) * 100}%`, display: 'flex', flexDirection: 'column-reverse', minWidth: 6,
              outline: index === current ? '2px solid var(--mantine-color-choral-3)' : undefined, outlineOffset: 1, borderRadius: 2, overflow: 'hidden',
              opacity: index === current ? 1 : 0.65,
            }}>
              {contextParts.filter((part) => input[part]).map((part) => (
                <Box key={part} bg={partColor[part]} style={{ height: `${(input[part]! / total) * 100}%` }} />
              ))}
            </UnstyledButton>
          </Tooltip>
        );
      })}
    </Group>
  );
}

export function CostBlock({ turn, dense }: { turn: DebugTurn; dense?: boolean }) {
  const phases = costByPhase(turn);
  return (
    <Block title="Coût" dense={dense} aside={<Text size="xs" fw={700}>{usd(turn.costUsd)} · {seconds(turn.durationMs)}</Text>}>
      <Stack gap={6}>
        <Progress.Root size={14}>
          {phases.map(({ phase, cost }) => (
            <Tooltip key={phase} label={`${phase} : ${usd(cost)}`}>
              <Progress.Section value={(cost / turn.costUsd) * 100} color={phaseColor[phase]}>
                <Progress.Label>{phase}</Progress.Label>
              </Progress.Section>
            </Tooltip>
          ))}
        </Progress.Root>
        <Table verticalSpacing={2} horizontalSpacing="xs" fz="xs">
          <Table.Thead><Table.Tr><Table.Th>Appel</Table.Th><Table.Th>Modèle</Table.Th><Table.Th ta="right">Entrée</Table.Th><Table.Th ta="right">Sortie</Table.Th><Table.Th ta="right">Durée</Table.Th><Table.Th ta="right">Coût</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {turn.calls.map((call) => (
              <Table.Tr key={call.label}>
                <Table.Td><Group gap={6}><Box w={8} h={8} bg={phaseColor[call.phase]} style={{ borderRadius: 2 }} />{call.label}</Group></Table.Td>
                <Table.Td c="dimmed">{call.model}</Table.Td>
                <Table.Td ta="right">{tokens(totalInput(call))}</Table.Td>
                <Table.Td ta="right">{tokens(call.outputTokens)}</Table.Td>
                <Table.Td ta="right">{seconds(call.durationMs)}</Table.Td>
                <Table.Td ta="right">{usd(call.costUsd)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Stack>
    </Block>
  );
}

/** Échelle nommée : on lit « montée », pas « 3/5 ». Le marqueur creux est le tour précédent, le plein la cible de ce tour. */
export function TensionScale({ previous, target }: { previous: number; target: number }) {
  return (
    <Stack gap={4}>
      <Group gap={2} wrap="nowrap">
        {tensionLevels.slice(1).map((level, i) => {
          const value = i + 1;
          return (
            <Box key={level} style={{ flex: 1 }}>
              <Box h={8} style={{
                borderRadius: 2,
                background: value <= target ? `var(--mantine-color-orange-${4 + value})` : 'var(--mantine-color-dark-5)',
                outline: value === previous && previous !== target ? '1px dashed var(--mantine-color-gray-4)' : undefined, outlineOffset: 2,
              }} />
              <Text size="xs" ta="center" mt={2} fw={value === target ? 700 : 400} c={value === target ? undefined : 'dimmed'}>{level}</Text>
            </Box>
          );
        })}
      </Group>
      <Text size="xs" c="dimmed">
        {target > previous ? `Le Directeur fait monter la tension d’un cran : de ${tensionLevels[previous]} à ${tensionLevels[target]}.`
          : target < previous ? `Le Directeur relâche la tension : de ${tensionLevels[previous]} à ${tensionLevels[target]}.`
            : `Le Directeur maintient la tension : ${tensionLevels[target]}.`}
        {' '}Le Narrateur dose conflit et rythme d’après cette cible.
      </Text>
    </Stack>
  );
}

export function DirectionBlock({ turn, dense }: { turn: DebugTurn; dense?: boolean }) {
  const direction = turn.direction;
  if (!direction) {
    return <Block title="Direction" dense={dense}><Text size="xs" c="dimmed">Directeur désactivé pour ce tour : toutes les contributions passent au Narrateur.</Text></Block>;
  }
  const { tension, nudges } = direction;
  return (
    <Stack gap="sm">
      <Block title="Tension visée" dense={dense}><TensionScale previous={tension.previous} target={tension.target} /></Block>
      <Block title="Interventions du Directeur" dense={dense}>
        <Stack gap={4}>
          {nudges.length === 0
            ? <Text size="xs" c="dimmed">Le Directeur n’est pas intervenu sur la suite.</Text>
            : nudges.map((nudge) => (
              <Text key={nudge.type} size="sm">Pousse vers <b>{nudge.type}</b> <Text span size="xs" c="dimmed">, parce que : {nudge.basis.toLowerCase()}</Text></Text>
            ))}
          {turn.thwarted && <Text size="xs" c="red.3">Une tentative du protagoniste a été contrariée.</Text>}
        </Stack>
      </Block>
    </Stack>
  );
}

const kindColor: Record<ItemKind, string> = { développement: 'cyan', suggestion: 'blue', alerte: 'orange' };

function ItemFate({ item }: { item: AnalysisItem }) {
  if (!item.transmitted) return <Text size="xs" c="dimmed">écarté · {item.discardReason}</Text>;
  if (item.scope === 'offscreen') return <Text size="xs" c="cyan.3">transmis · hors champ, fait connu du Gardien</Text>;
  return (
    <Group gap={4} wrap="nowrap">
      <Text size="xs" c="dimmed">transmis →</Text>
      <Badge size="xs" variant="light" color={verdictColor[item.prose!]}>{item.prose === 'ignoré' ? 'absent de la prose' : `${item.prose} dans la prose`}</Badge>
    </Group>
  );
}

export function analysisCounts(turn: DebugTurn) {
  const items = turn.analysis.flatMap((output) => output.items);
  return {
    produced: items.length,
    transmitted: items.filter((item) => item.transmitted).length,
    inProse: items.filter((item) => item.prose === 'retenu' || item.prose === 'partiel').length,
    offscreen: items.filter((item) => item.transmitted && item.scope === 'offscreen').length,
  };
}

/** Ce que chaque agent d'analyse a produit, et le sort de chaque item jusqu'à la prose. */
export function AnalysisBlock({ turn, onOpenRaw }: { turn: DebugTurn; onOpenRaw: () => void }) {
  const [filter, setFilter] = useState<'all' | 'transmitted' | 'discarded'>('all');
  return (
    <Stack gap="sm">
      <SegmentedControl size="xs" w="fit-content" value={filter} onChange={(value) => setFilter(value as typeof filter)} data={[
        { value: 'all', label: 'Tous les items' }, { value: 'transmitted', label: 'Transmis' }, { value: 'discarded', label: 'Écartés' },
      ]} />
      {turn.analysis.map((output) => {
        const items = output.items.filter((item) => filter === 'all' || (filter === 'transmitted') === item.transmitted);
        const kept = output.items.filter((item) => item.transmitted).length;
        return (
          <Paper key={output.agent} withBorder radius="md" p="sm" bg="dark.7" style={{ borderLeft: '3px solid var(--mantine-color-blue-7)' }}>
            <Group justify="space-between" mb={6}>
              <Group gap="xs"><Text fw={700} size="sm">{output.agent}</Text>
                <Text size="xs" c="dimmed">{output.items.length} items · {kept} transmis · {seconds(output.durationMs)}</Text></Group>
              <Anchor size="xs" onClick={onOpenRaw}>Réponse brute →</Anchor>
            </Group>
            {items.length === 0 ? <Text size="xs" c="dimmed">Aucun item dans ce filtre.</Text> : (
              <Stack gap={4}>
                {items.map((item) => (
                  <Group key={item.text} gap="xs" wrap="nowrap" opacity={item.transmitted ? 1 : 0.6}>
                    <Badge size="xs" variant="light" color={kindColor[item.kind]} w={100}>{item.kind}</Badge>
                    <Text size="sm" style={{ flex: 1 }}>{item.text}</Text>
                    <ItemFate item={item} />
                  </Group>
                ))}
              </Stack>
            )}
          </Paper>
        );
      })}
    </Stack>
  );
}

export function ConfigBlock({ turn, dense }: { turn: DebugTurn; dense?: boolean }) {
  return (
    <Block title="Configuration" dense={dense}>
      {turn.configChanges.length === 0
        ? <Text size="xs" c="dimmed">Aucun changement depuis le tour précédent.</Text>
        : <Group gap={6}>{turn.configChanges.map((change) => (
          <Badge key={change.label} size="sm" variant="light" color={changeColor[change.kind]}>
            {change.kind === 'added' ? '+ ' : change.kind === 'removed' ? '− ' : '~ '}{change.label}
          </Badge>
        ))}</Group>}
    </Block>
  );
}

export function StoryRatesBlock({ turns, dense }: { turns: DebugTurn[]; dense?: boolean }) {
  const rates = storyRates(turns);
  const stat = (label: string, value: string) => (
    <Stack gap={0}><Text size="lg" fw={700}>{value}</Text><Text size="xs" c="dimmed">{label}</Text></Stack>
  );
  return (
    <Block title={`Récit · ${turns.length} tours`} dense={dense}>
      <SimpleGrid cols={3} spacing="xs">
        {stat('tours avec nudge', `${Math.round(rates.nudgeRate * 100)} %`)}
        {stat('tentatives contrariées', `${Math.round(rates.thwartedRate * 100)} %`)}
        {stat('coût total', usd(rates.totalCost))}
      </SimpleGrid>
    </Block>
  );
}
