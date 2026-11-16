import { useState } from 'react';
import { Alert, Button, Text } from '@mantine/core';
import { Outlet } from 'react-router-dom';

import { getErrorMessage } from '../api/client.js';
import { useAuth } from '../auth/AuthProvider.js';
import { Brand } from './Brand.js';
import { WorkspaceNavigation } from './WorkspaceNavigation.js';

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
    <div className="workspace">
      <aside className="desktop-sidebar">
        <Brand />
        <WorkspaceNavigation />
        <Button
          className="sidebar-logout" variant="subtle" color="gray"
          loading={pending} onClick={() => void handleLogout()}
        >
          Se déconnecter
        </Button>
      </aside>
      <main className="workspace-main">
        <header className="topbar">
          <div className="topbar-brand"><Brand /></div>
          <Text size="sm" c="dimmed" className="desktop-greeting">Votre espace de création</Text>
          <Button
            className="mobile-logout" variant="subtle" color="gray" size="xs"
            loading={pending} onClick={() => void handleLogout()}
          >
            Déconnexion
          </Button>
        </header>
        <div className="page-content">
          {error && <Alert color="red" mb="md" title="Déconnexion impossible">{error}</Alert>}
          <Outlet />
        </div>
      </main>
      <WorkspaceNavigation compact />
    </div>
  );
}
