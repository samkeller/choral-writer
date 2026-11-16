import { Button, Text, Title } from '@mantine/core';
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <section className="welcome-panel">
      <Title order={1} size="h2">Page introuvable</Title>
      <Text c="dimmed" mt="sm">Cette page n’existe pas.</Text>
      <Button component={Link} to="/" variant="light" mt="lg">Retour à l’accueil</Button>
    </section>
  );
}
