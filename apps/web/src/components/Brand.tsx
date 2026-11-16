import { Group, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconFeather } from '@tabler/icons-react';

export function Brand() {
  return (
    <Group gap="sm" wrap="nowrap">
      <ThemeIcon size={40} radius="md" variant="light" color="choral">
        <IconFeather size={20} stroke={1.8} />
      </ThemeIcon>
      <Stack gap={0}>
        <Text fw={700} size="sm" lh={1.2}>Choral Writer</Text>
        <Text size="xs" c="dimmed">Histoires en devenir</Text>
      </Stack>
    </Group>
  );
}
