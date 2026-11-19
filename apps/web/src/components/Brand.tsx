import { Group, Stack, Text, ThemeIcon } from '@mantine/core';

export function Brand({ iconOnly = false }: { iconOnly?: boolean }) {
  const mark = (
    <ThemeIcon size={40} radius="md" variant="light" color="choral">
      <img src="/assets/logo.png" alt="" width={26} height={26} aria-hidden="true" />
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
