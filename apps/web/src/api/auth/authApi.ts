import {
  authenticatedSessionSchema, loggedOutSessionSchema, loginRequestSchema,
  type AuthenticatedSession, type LoggedOutSession, type LoginRequest,
} from '@choral-writer/shared';

import { api } from '../client';

export async function getSession(): Promise<AuthenticatedSession> {
  const response = await api.get<unknown>('/session');
  return authenticatedSessionSchema.parse(response.data);
}

export async function login(input: LoginRequest): Promise<AuthenticatedSession> {
  const response = await api.post<unknown>('/login', loginRequestSchema.parse(input));
  return authenticatedSessionSchema.parse(response.data);
}

export async function logout(): Promise<LoggedOutSession> {
  const response = await api.post<unknown>('/logout');
  return loggedOutSessionSchema.parse(response.data);
}
