import { Box, Group, Text, Tooltip, UnstyledButton } from '@mantine/core';

/** A slice of a bar: its color and its share of the bar, from 0 to 1. */
export type BarSegment = { color: string; share: number };

/**
 * One vertical bar per turn, as tall as its value relative to `scaleMax`, or to the largest value without one
 * (a fixed scale keeps the same height for the same value across stories).
 * A turn with segments is stacked, first segment at the bottom; otherwise it is plain `color`.
 * The current turn is outlined; clicking a bar opens that turn.
 */
export function EvolutionBars({ values, current, color, describe, onSelect, height = 80, scaleMax, segmentsOf }: {
  values: (number | null)[];
  current: number;
  color: string;
  describe: (value: number | null, turnNumber: number) => string;
  onSelect: (index: number) => void;
  height?: number;
  scaleMax?: number;
  segmentsOf?: (index: number) => BarSegment[] | null;
}) {
  const max = scaleMax ?? Math.max(0, ...values.map((value) => value ?? 0));
  if (max === 0) return <Text size="sm" c="dimmed">Aucune mesure disponible pour ce récit.</Text>;

  return (
    <Group gap={3} align="flex-end" h={height} wrap="nowrap">
      {values.map((value, index) => {
        const label = describe(value, index + 1);
        const segments = value === null ? null : segmentsOf?.(index);
        return (
          <Tooltip key={index} label={label}>
            <UnstyledButton aria-label={label} aria-current={index === current || undefined} onClick={() => onSelect(index)}
              h="100%" miw={4} maw={32} style={{ flex: 1, display: 'flex', alignItems: 'flex-end' }}>
              <Box w="100%" bg={value === null ? 'dark.5' : segments?.length ? undefined : color}
                opacity={index === current ? 1 : 0.55}
                h={value === null ? 2 : `${Math.max(2, (value / max) * 100)}%`}
                style={{
                  display: 'flex',
                  flexDirection: 'column-reverse',
                  overflow: 'hidden',
                  borderRadius: 2,
                  outline: index === current ? '2px solid var(--mantine-color-choral-3)' : undefined,
                  outlineOffset: 1,
                }}>
                {segments?.map((segment, position) => (
                  <Box key={position} bg={segment.color} h={`${segment.share * 100}%`} />
                ))}
              </Box>
            </UnstyledButton>
          </Tooltip>
        );
      })}
    </Group>
  );
}
