import { useState } from 'react';
import { Alert, AppShell, Box, Button, Container, Group, Stack, Text } from '@mantine/core';
import { Outlet } from 'react-router-dom';

import { getErrorMessage } from '../api/client.js';
import { useAuth } from '../auth/AuthProvider.js';
import { Brand } from './Brand.js';
import { WorkspaceNavigation } from './WorkspaceNavigation.js';
import styles from './WorkspaceLayout.module.css';

export function WorkspaceLayout() {
  const { logout } = useAuth();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setError('');
    setPending(true);
    try {
      await logout();
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <AppShell
      withBorder
      padding={0}
      header={{ height: 64 }}
      navbar={{ width: 256, breakpoint: 'sm', collapsed: { mobile: true } }}
      className={styles.shell}
    >
      <AppShell.Header px="md">
        <Group h="100%" justify="space-between" gap="sm">
          <Box hiddenFrom="sm"><Brand /></Box>
          <Text size="sm" c="dimmed" visibleFrom="sm">Votre espace de création</Text>
          <Button
            variant="subtle" color="gray" size="xs" hiddenFrom="sm"
            loading={pending} onClick={() => void handleLogout()}
          >
            Déconnexion
          </Button>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="md" className={styles.navbar}>
        <Stack h="100%" gap="md">
          <Brand />
          <WorkspaceNavigation />
          <Button
            variant="subtle" color="gray" mt="auto"
            loading={pending} onClick={() => void handleLogout()}
          >
            Se déconnecter
          </Button>
        </Stack>
      </AppShell.Navbar>
      <AppShell.Main className={styles.main}>
        <Container
          size="xl"
          pt="xl"
          pb={{ base: 'calc(5.5rem + env(safe-area-inset-bottom))', sm: 'xl' }}
          px={{ base: 'md', sm: 'xl' }}
        >
          {error && <Alert color="red" mb="md" title="Déconnexion impossible" role="alert">{error}</Alert>}
          <Outlet />
        </Container>
      </AppShell.Main>
      <Box className={styles.mobileFooter} hiddenFrom="sm">
        <WorkspaceNavigation compact />
      </Box>
    </AppShell>
  );
}
