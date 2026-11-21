// PROTOTYPE — blocs du mode Debug, partagés par les variantes A, B et C (seule la mise en page varie).
import { useEffect, useState, type ReactNode } from 'react';
import { Badge, Box, Group, Loader, Paper, Progress, SimpleGrid, Stack, Table, Text, Tooltip, UnstyledButton } from '@mantine/core';

import {
  type DebugTurn, changeColor, contextParts, costByPhase, partColor, phaseColor, seconds, storyRates, tokens,
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

export function DirectionBlock({ turn, dense }: { turn: DebugTurn; dense?: boolean }) {
  const direction = turn.direction;
  if (!direction) {
    return <Block title="Direction" dense={dense}><Text size="xs" c="dimmed">Directeur désactivé pour ce tour : toutes les contributions passent au Narrateur.</Text></Block>;
  }
  const { tension, nudges, items } = direction;
  return (
    <Block title="Direction" dense={dense}
      aside={<Group gap={4}><Text size="xs" c="dimmed">tension</Text><Badge size="xs" variant="outline">{tension.previous}/5</Badge><Text size="xs">→</Text>
        <Badge size="xs" color={tension.target > tension.previous ? 'orange' : 'gray'}>{tension.target}/5</Badge></Group>}>
      <Stack gap={6}>
        {nudges.length === 0
          ? <Text size="xs" c="dimmed">Le Directeur n’est pas intervenu sur la suite.</Text>
          : <Stack gap={2}>{nudges.map((nudge) => (
            <Text key={nudge.type} size="xs">Le Directeur pousse vers <b>{nudge.type}</b> <Text span size="xs" c="dimmed">, parce que : {nudge.basis.toLowerCase()}</Text></Text>
          ))}</Stack>}
        {turn.thwarted && <Text size="xs" c="red.3">Une tentative du protagoniste a été contrariée.</Text>}
        <Text size="xs" fw={600} mt={4}>Contributions transmises au Narrateur</Text>
        <Table verticalSpacing={2} horizontalSpacing="xs" fz="xs">
          <Table.Tbody>
            {items.map((item) => (
              <Table.Tr key={item.agent} opacity={item.kept ? 1 : 0.6}>
                <Table.Td w={24}><Badge size="xs" circle color={item.kept ? 'green' : 'gray'}>{item.kept ? '✓' : '×'}</Badge></Table.Td>
                <Table.Td w={90}>{item.agent}</Table.Td>
                <Table.Td>{item.item}</Table.Td>
                <Table.Td w={80}><Badge size="xs" variant="outline" color={item.scope === 'scene' ? 'blue' : 'cyan'}>{item.scope === 'scene' ? 'scène' : 'hors champ'}</Badge></Table.Td>
                <Table.Td w={190} c="dimmed">{item.reason ?? ''}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Stack>
    </Block>
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
