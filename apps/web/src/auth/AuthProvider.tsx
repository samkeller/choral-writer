import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { LoginRequest } from '@choral-writer/shared';

import * as authApi from '../api/auth.js';
import { ClientApiError, getErrorMessage, sessionEvents } from '../api/client.js';

type Session =
  | { status: 'loading' | 'anonymous' | 'authenticated' }
  | { status: 'error'; message: string };

interface AuthContextValue {
  session: Session;
  retry: () => void;
  login: (input: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const expireSession = () => setSession({ status: 'anonymous' });
    sessionEvents.addEventListener('unauthorized', expireSession);

    async function checkSession() {
      try {
        await authApi.getSession();
        if (active) setSession({ status: 'authenticated' });
      } catch (error) {
        if (!active) return;
        if (error instanceof ClientApiError && error.details.status === 401 && error.details.source === 'application') {
          setSession({ status: 'anonymous' });
        } else {
          setSession({ status: 'error', message: getErrorMessage(error) });
        }
      }
    }

    void checkSession();
    return () => {
      active = false;
      sessionEvents.removeEventListener('unauthorized', expireSession);
    };
  }, [attempt]);

  async function login(input: LoginRequest) {
    await authApi.login(input);
    setSession({ status: 'authenticated' });
  }

  async function logout() {
    await authApi.logout();
    setSession({ status: 'anonymous' });
  }

  function retry() {
    setSession({ status: 'loading' });
    setAttempt((value) => value + 1);
  }

  return (
    <AuthContext.Provider value={{ session, retry, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider.');
  return context;
}
