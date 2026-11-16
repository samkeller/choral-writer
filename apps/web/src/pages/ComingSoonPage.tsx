import { Text, Title } from '@mantine/core';
import type { Icon } from '@tabler/icons-react';

export function ComingSoonPage({ title, icon: PageIcon }: { title: string; icon: Icon }) {
  return (
    <section className="welcome-panel">
      <div className="welcome-icon"><PageIcon size={26} stroke={1.6} /></div>
      <Text c="teal.3" size="sm" fw={600} tt="uppercase">{title}</Text>
      <Title order={1} size="h2" mt="xs">{title}</Title>
      <Text c="dimmed" mt="sm">Cet espace sera disponible dans une prochaine étape du MVP.</Text>
    </section>
  );
}
