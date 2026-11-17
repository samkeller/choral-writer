import { Alert, Button, Center, Loader, Paper, Stack } from '@mantine/core';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { Brand } from '../components/Brand';
import { useAuth } from './AuthProvider';

export function SessionBoundary() {
  const { session, retry } = useAuth();

  if (session.status === 'loading') {
    return <Center mih="100dvh" p="md"><Loader color="choral" aria-label="Chargement de la session" /></Center>;
  }

  if (session.status === 'error') {
    return (
      <Center mih="100dvh" p="md">
        <Paper w="100%" maw={420} p="xl" withBorder>
          <Stack gap="lg">
            <Brand />
            <Alert color="red" title="Connexion au serveur impossible" role="alert">{session.message}</Alert>
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
