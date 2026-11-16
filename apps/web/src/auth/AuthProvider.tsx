import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import axios from 'axios';
import type { LoginRequest } from '@choral-writer/shared';

import * as authApi from '../api/auth.js';
import { api, getErrorMessage } from '../api/client.js';

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
    const interceptor = api.interceptors.response.use(undefined, (error: unknown) => {
      if (active && axios.isAxiosError(error) && error.response?.status === 401
        && error.config?.url !== '/login') {
        setSession({ status: 'anonymous' });
      }
      return Promise.reject(error);
    });

    async function checkSession() {
      try {
        await authApi.getSession();
        if (active) setSession({ status: 'authenticated' });
      } catch (error) {
        if (!active) return;
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          setSession({ status: 'anonymous' });
        } else {
          setSession({ status: 'error', message: getErrorMessage(error) });
        }
      }
    }

    void checkSession();
    return () => {
      active = false;
      api.interceptors.response.eject(interceptor);
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
