import { Box, Group, Progress, Stack, Text, Tooltip } from '@mantine/core';
import type { TraceCallSummary, TurnMetrics } from '@choral-writer/shared';

import { stagePresentation, stagePresentationOf } from '../../phases/stagePresentation';
import { formatTokens } from '../turnFormat';
import { DrawerBlock } from './DrawerBlock';
import { EvolutionBars } from './EvolutionBars';

/** « Contexte » : what each call received, and how the Narrator input evolves over the story. */
export function TurnContextPanel({ calls, metrics, index, onSelectTurn }: {
  calls: TraceCallSummary[];
  metrics: TurnMetrics[] | null;
  index: number;
  onSelectTurn: (index: number) => void;
}) {
  const largestInput = Math.max(0, ...calls.map((call) => call.inputTokens ?? 0));

  return (
    <Stack gap="sm">
      <DrawerBlock title="Entrée par appel">
        {calls.length === 0 ? <Text size="sm" c="dimmed">Aucun appel enregistré pour ce tour.</Text> : (
          <Stack gap={6}>
            {calls.map((call) => {
              const { label, color } = stagePresentationOf(call.stage);
              const name = call.agentName ?? label;
              const share = largestInput > 0 && call.inputTokens !== null ? (call.inputTokens / largestInput) * 100 : 0;
              return (
                <Group key={call.id} gap="xs" wrap="nowrap">
                  <Text size="xs" w={110} truncate title={`${name} · ${label}`}>{name}</Text>
                  <Box style={{ flex: 1 }}>
                    <Tooltip label={`${name} : ${formatTokens(call.inputTokens)} tokens en entrée`}>
                      <Progress.Root size={call.stage === 'narrator' ? 14 : 10} bg="transparent" w={`${share}%`}>
                        <Progress.Section value={100} color={color} />
                      </Progress.Root>
                    </Tooltip>
                  </Box>
                  <Text size="xs" c="dimmed" w={110} ta="right">
                    {formatTokens(call.inputTokens)} → {formatTokens(call.outputTokens)}
                  </Text>
                </Group>
              );
            })}
            <Text size="xs" c="dimmed">
              Tokens en entrée → en sortie. Chaque barre est proportionnelle à l’appel le plus lourd du tour.
            </Text>
          </Stack>
        )}
      </DrawerBlock>
      {metrics && (
        <DrawerBlock title="Entrée du Narrateur au fil des tours">
          <EvolutionBars values={metrics.map((turn) => turn.narratorInputTokens)} current={index}
            color={stagePresentation.narrator.color} onSelect={onSelectTurn}
            describe={(tokens, turnNumber) => `Tour ${turnNumber} : ${tokens === null ? 'non mesuré' : `${formatTokens(tokens)} tokens`}`} />
        </DrawerBlock>
      )}
    </Stack>
  );
}
