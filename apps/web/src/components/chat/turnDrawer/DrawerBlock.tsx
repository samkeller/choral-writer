import type { ReactNode } from 'react';
import { Group, Paper, Text } from '@mantine/core';

/** A clearly separated section of the turn drawer. */
export function DrawerBlock({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <Paper component="section" withBorder p="sm" bg="dark.7" radius="md" aria-label={title}>
      <Group justify="space-between" mb="xs" gap="xs">
        <Text size="xs" fw={700} tt="uppercase" c="dimmed" lts="0.06em">{title}</Text>
        {aside}
      </Group>
      {children}
    </Paper>
  );
}
