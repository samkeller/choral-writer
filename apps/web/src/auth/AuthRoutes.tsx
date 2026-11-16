import { Alert, Button, Center, Loader, Paper, Stack } from '@mantine/core';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { Brand } from '../components/Brand.js';
import { useAuth } from './AuthProvider.js';

export function SessionBoundary() {
  const { session, retry } = useAuth();

  if (session.status === 'loading') {
    return <Center className="screen-center"><Loader color="teal" aria-label="Chargement de la session" /></Center>;
  }

  if (session.status === 'error') {
    return (
      <Center className="screen-center">
        <Paper className="login-card" p="xl" radius="lg" withBorder>
          <Stack>
            <Brand />
            <Alert color="red" title="Connexion au serveur impossible">{session.message}</Alert>
            <Button onClick={retry}>Réessayer</Button>
          </Stack>
        </Paper>
      </Center>
    );
  }

  return <Outlet />;
}

export function RequireAuth() {
  const { session } = useAuth();
  const location = useLocation();

  return session.status === 'authenticated'
    ? <Outlet />
    : <Navigate to="/login" replace state={{ from: location.pathname + location.search + location.hash }} />;
}
