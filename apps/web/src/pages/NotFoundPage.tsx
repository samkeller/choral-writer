import { Button, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <Stack gap="md" maw={580} pt={{ base: 'lg', sm: '3rem' }}>
      <Title order={1} size="h2">Page introuvable</Title>
      <Text c="dimmed">Cette page n’existe pas.</Text>
      <Button component={Link} to="/" variant="light" w="fit-content">Retour à l’accueil</Button>
    </Stack>
  );
}
