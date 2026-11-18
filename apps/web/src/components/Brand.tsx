import { Group, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconFeather } from '@tabler/icons-react';

export function Brand({ iconOnly = false }: { iconOnly?: boolean }) {
  const mark = (
    <ThemeIcon size={40} radius="md" variant="light" color="choral">
      <IconFeather size={20} stroke={1.8} aria-hidden="true" />
    </ThemeIcon>
  );

  if (iconOnly) return mark;

  return (
    <Group gap="sm" wrap="nowrap">
      {mark}
      <Stack gap={0}>
        <Text fw={700} size="sm" lh={1.2}>Choral Writer</Text>
        <Text size="xs" c="dimmed">Histoires en devenir</Text>
      </Stack>
    </Group>
  );
}
