import { Button, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconFeather } from '@tabler/icons-react';
import { Link } from 'react-router-dom';

export function HomePage() {
  return (
    <Stack gap="md" maw={580} pt={{ base: 'lg', sm: '3rem' }}>
      <ThemeIcon size={52} radius="lg" variant="light" color="choral">
        <IconFeather size={26} stroke={1.6} />
      </ThemeIcon>
      <Text c="choral.3" size="sm" fw={600} tt="uppercase">
        Atelier de narration
      </Text>
      <Title order={1} size="h2">Votre prochaine histoire commence ici.</Title>
      <Text c="dimmed" maw={480} lh={1.7}>
        Créez un projet pour donner vie à un monde, ses personnages et leurs histoires.
      </Text>
      <Button component={Link} to="/projects" mt="sm" w="fit-content">Retrouver mes projets</Button>
    </Stack>
  );
}
