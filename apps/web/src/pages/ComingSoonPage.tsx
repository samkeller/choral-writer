import { Stack, Text, ThemeIcon, Title } from '@mantine/core';
import type { Icon } from '@tabler/icons-react';

export function ComingSoonPage({ title, icon: PageIcon }: { title: string; icon: Icon }) {
  return (
    <Stack gap="md" maw={580} pt={{ base: 'lg', sm: '3rem' }}>
      <ThemeIcon size={52} radius="lg" variant="light" color="choral">
        <PageIcon size={26} stroke={1.6} />
      </ThemeIcon>
      <Text c="choral.3" size="sm" fw={600} tt="uppercase">{title}</Text>
      <Title order={1} size="h2">{title}</Title>
      <Text c="dimmed">Cet espace sera disponible dans une prochaine étape du MVP.</Text>
    </Stack>
  );
}
