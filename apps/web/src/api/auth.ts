import { authenticatedSessionSchema, loginRequestSchema, type LoginRequest } from '@choral-writer/shared';

import { api } from './client.js';

export async function getSession(): Promise<void> {
  const response = await api.get<unknown>('/session');
  authenticatedSessionSchema.parse(response.data);
}

export async function login(input: LoginRequest): Promise<void> {
  const response = await api.post<unknown>('/login', loginRequestSchema.parse(input));
  authenticatedSessionSchema.parse(response.data);
}

export async function logout(): Promise<void> {
  await api.post('/logout');
}
