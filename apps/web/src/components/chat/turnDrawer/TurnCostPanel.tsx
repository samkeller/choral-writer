import { Box, Group, Progress, Stack, Table, Text, Tooltip } from '@mantine/core';
import type { TurnTraceSummary } from '@choral-writer/shared';

import { stagePresentationOf } from '../../phases/stagePresentation';
import { formatCost, formatSeconds, formatTokens, formatUsd } from '../turnFormat';
import { DrawerBlock } from './DrawerBlock';
import { TurnTimeline } from './TurnTimeline';

/** « Coût et durée » : where the money and the time of a turn went. */
export function TurnCostPanel({ summary }: { summary: TurnTraceSummary }) {
  const costByStage = summary.timeline.map(({ stage }) => ({
    stage,
    microUsd: summary.calls.filter((call) => call.stage === stage).reduce((sum, call) => sum + (call.costMicroUsd ?? 0), 0),
  })).filter((item) => item.microUsd > 0);

  return (
    <Stack gap="sm">
      <DrawerBlock title="Coût par étape" aside={<Text size="xs" fw={700}>{formatCost(summary.cost)}</Text>}>
        {costByStage.length === 0 ? <Text size="sm" c="dimmed">Aucun coût connu pour ce tour.</Text> : (
          <Stack gap={6}>
            <Progress.Root size={14}>
              {costByStage.map(({ stage, microUsd }) => {
                const { label, color } = stagePresentationOf(stage);
                return (
                  <Tooltip key={stage} label={`${label} : ${formatUsd(microUsd)}`}>
                    <Progress.Section value={(microUsd / summary.cost.microUsd) * 100} color={color} />
                  </Tooltip>
                );
              })}
            </Progress.Root>
            <Group gap="sm">
              {costByStage.map(({ stage, microUsd }) => {
                const { label, color } = stagePresentationOf(stage);
                return (
                  <Group key={stage} gap={4} wrap="nowrap">
                    <Box w={8} h={8} bg={color} style={{ borderRadius: 2 }} aria-hidden="true" />
                    <Text size="xs" c="dimmed">{label} {formatUsd(microUsd)}</Text>
                  </Group>
                );
              })}
            </Group>
            {!summary.cost.complete && <Text size="xs" c="dimmed">Total partiel : certains appels n’ont pas de prix connu.</Text>}
          </Stack>
        )}
      </DrawerBlock>

      <DrawerBlock title="Déroulé du tour" aside={<Text size="xs" fw={700}>{formatSeconds(summary.durationMs)}</Text>}>
        <TurnTimeline timeline={summary.timeline} />
      </DrawerBlock>

      <DrawerBlock title="Appels">
        <Table.ScrollContainer minWidth={520}>
          <Table verticalSpacing={2} horizontalSpacing="xs" fz="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Appel</Table.Th>
                <Table.Th>Modèle</Table.Th>
                <Table.Th ta="right">Entrée</Table.Th>
                <Table.Th ta="right">Sortie</Table.Th>
                <Table.Th ta="right">Durée</Table.Th>
                <Table.Th ta="right">Coût</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {summary.calls.map((call) => {
                const { label, color } = stagePresentationOf(call.stage);
                const failed = call.status === 'error';
                return (
                  <Table.Tr key={call.id}>
                    <Table.Td>
                      <Group gap={6} wrap="nowrap">
                        <Box w={8} h={8} bg={failed ? 'red.6' : color} style={{ borderRadius: 2, flexShrink: 0 }}
                          aria-hidden="true" />
                        {call.agentName ?? label}{failed ? ' (échec)' : ''}
                      </Group>
                    </Table.Td>
                    <Table.Td c="dimmed">{call.model}</Table.Td>
                    <Table.Td ta="right">{formatTokens(call.inputTokens)}</Table.Td>
                    <Table.Td ta="right">{formatTokens(call.outputTokens)}</Table.Td>
                    <Table.Td ta="right">{formatSeconds(call.durationMs)}</Table.Td>
                    <Table.Td ta="right">{call.costMicroUsd === null ? '—' : formatUsd(call.costMicroUsd)}</Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </DrawerBlock>
    </Stack>
  );
}
