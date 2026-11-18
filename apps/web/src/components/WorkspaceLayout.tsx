import { useState } from 'react';
import { Alert, AppShell, Box, Container, Stack } from '@mantine/core';
import { IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand, IconLogout } from '@tabler/icons-react';
import { Outlet, useMatch } from 'react-router-dom';

import { getErrorMessage } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { Brand } from './Brand';
import { WorkspaceNavigation } from './WorkspaceNavigation';
import { IconAction } from './atoms/IconAction';
import styles from './WorkspaceLayout.module.css';

const NAVBAR_WIDTH = 256;
const NAVBAR_RAIL_WIDTH = 72;

export function WorkspaceLayout() {
  const { logout } = useAuth();
  const chatRoute = useMatch('/projects/:projectId');
  const [collapsed, setCollapsed] = useState(false);
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

  const toggleLabel = collapsed ? 'Déplier le menu' : 'Replier le menu';

  return (
    <AppShell
      withBorder
      padding={0}
      header={chatRoute ? undefined : { height: { base: 0, sm: 64 } }}
      navbar={{ width: collapsed ? NAVBAR_RAIL_WIDTH : NAVBAR_WIDTH, breakpoint: 'sm', collapsed: { mobile: true } }}
      className={styles.shell}
    >
      {!chatRoute && <AppShell.Header visibleFrom="sm" />}
      <AppShell.Navbar p={collapsed ? 'xs' : 'md'} className={styles.navbar}>
        <Stack h="100%" gap="md" align={collapsed ? 'center' : undefined}>
          <Brand iconOnly={collapsed} />
          <WorkspaceNavigation variant={collapsed ? 'rail' : 'list'} />
          <Stack mt="auto" gap="xs" w="100%" align={collapsed ? 'center' : 'flex-start'}>
            <IconAction label="Se déconnecter" loading={pending} onClick={() => void handleLogout()}>
              <IconLogout size={18} aria-hidden="true" />
            </IconAction>
            <IconAction label={toggleLabel} onClick={() => setCollapsed((value) => !value)}>
              {collapsed
                ? <IconLayoutSidebarLeftExpand size={18} aria-hidden="true" />
                : <IconLayoutSidebarLeftCollapse size={18} aria-hidden="true" />}
            </IconAction>
          </Stack>
        </Stack>
      </AppShell.Navbar>
      <AppShell.Main className={chatRoute ? `${styles.main} ${styles.chatMain}` : styles.main}>
        <Container
          size={chatRoute ? '100%' : 'xl'}
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
        <WorkspaceNavigation variant="compact" trailingAction={
          <IconAction label="Déconnexion" className={styles.mobileLogout}
            loading={pending} onClick={() => void handleLogout()}>
            <IconLogout size={18} aria-hidden="true" />
          </IconAction>
        } />
      </Box>
    </AppShell>
  );
}
