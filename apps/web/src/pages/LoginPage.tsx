import { useState, type FormEvent } from 'react';
import { Alert, Button, Center, Paper, PasswordInput, Stack } from '@mantine/core';
import { Navigate, useLocation } from 'react-router-dom';
import { loginRequestSchema } from '@choral-writer/shared';

import { getErrorMessage } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { Brand } from '../components/Brand';

function getReturnPath(state: unknown): string {
  if (typeof state === 'object' && state !== null && 'from' in state
    && typeof state.from === 'string' && state.from.startsWith('/')
    && !state.from.startsWith('//') && state.from !== '/login') {
    return state.from;
  }
  return '/';
}

export function LoginPage() {
  const { session, login } = useAuth();
  const location = useLocation();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  if (session.status === 'authenticated') {
    return <Navigate to={getReturnPath(location.state)} replace />;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const result = loginRequestSchema.safeParse({ password });
    if (!result.success) {
      setError('Saisissez un mot de passe valide pour continuer.');
      return;
    }

    setPending(true);
    try {
      await login(result.data);
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <Center mih="100dvh" p="md">
      <Paper w="100%" maw={420} p="xl" withBorder>
        <form onSubmit={submit}>
          <Stack>
            <Brand />
            <PasswordInput
              label="Mot de passe"
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              autoComplete="current-password"
              autoFocus
            />
            {error && <Alert color="red" role="alert">{error}</Alert>}
            <Button type="submit" loading={pending} fullWidth>Se connecter</Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
