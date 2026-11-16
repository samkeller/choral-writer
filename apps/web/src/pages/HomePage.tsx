import { Button, Text, Title } from '@mantine/core';
import { IconFeather } from '@tabler/icons-react';
import { Link } from 'react-router-dom';

export function HomePage() {
  return (
    <section className="welcome-panel">
      <div className="welcome-icon"><IconFeather size={26} stroke={1.6} /></div>
      <Text c="teal.3" size="sm" fw={600} tt="uppercase" className="tracking-wide">
        Atelier de narration
      </Text>
      <Title order={1} size="h2" mt="xs">Votre prochaine histoire commence ici.</Title>
      <Text c="dimmed" maw={480} mt="sm" lh={1.7}>
        Créez un projet pour donner vie à un monde, ses personnages et leurs histoires.
      </Text>
      <Button component={Link} to="/projects" mt="xl">Retrouver mes projets</Button>
    </section>
  );
}
