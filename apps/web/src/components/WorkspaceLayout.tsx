import { useState } from 'react';
import { Alert, AppShell, Box, Container, Stack } from '@mantine/core';
import { IconLogout } from '@tabler/icons-react';
import { Outlet, useMatch } from 'react-router-dom';

import { getErrorMessage } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { Brand } from './Brand';
import { WorkspaceNavigation } from './WorkspaceNavigation';
import { IconAction } from './atoms/IconAction';
import styles from './WorkspaceLayout.module.css';

export function WorkspaceLayout() {
  const { logout } = useAuth();
  const chatRoute = useMatch('/projects/:projectId');
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
      header={{ height: { base: 0, sm: 64 } }}
      navbar={{ width: 256, breakpoint: 'sm', collapsed: { mobile: true } }}
      className={styles.shell}
    >
      <AppShell.Header visibleFrom="sm" />
      <AppShell.Navbar p="md" className={styles.navbar}>
        <Stack h="100%" gap="md">
          <Brand />
          <WorkspaceNavigation />
          <IconAction label="Se déconnecter" mt="auto"
            loading={pending} onClick={() => void handleLogout()}
          >
            <IconLogout size={18} aria-hidden="true" />
          </IconAction>
        </Stack>
      </AppShell.Navbar>
      <AppShell.Main className={chatRoute ? `${styles.main} ${styles.chatMain}` : styles.main}>
        <Container
          size="xl"
          pt={chatRoute ? { base: 'xs', sm: 'xl' } : 'xl'}
          pb={{ base: 'calc(5rem + env(safe-area-inset-bottom))', sm: 'xl' }}
          px={{ base: chatRoute ? 'sm' : 'md', sm: 'xl' }}
          className={chatRoute ? styles.chatContainer : undefined}
        >
          {error && <Alert color="red" mb="md" title="Déconnexion impossible" role="alert">{error}</Alert>}
          <Outlet />
        </Container>
      </AppShell.Main>
      <Box className={styles.mobileFooter} hiddenFrom="sm">
        <WorkspaceNavigation compact trailingAction={
          <IconAction label="Déconnexion" className={styles.mobileLogout}
            loading={pending} onClick={() => void handleLogout()}>
            <IconLogout size={18} aria-hidden="true" />
          </IconAction>
        } />
      </Box>
    </AppShell>
  );
}
