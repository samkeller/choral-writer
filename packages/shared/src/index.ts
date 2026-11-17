import { z } from 'zod';

export * from './projects.js';
export * from './agents.js';
export * from './chat/index.js';
export * from './errors.js';
export * from './pipeline.js';

export const loginRequestSchema = z.object({
  password: z.string().min(1).max(512),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const authenticatedSessionSchema = z.object({
  authenticated: z.literal(true),
});

export type AuthenticatedSession = z.infer<typeof authenticatedSessionSchema>;

export const loggedOutSessionSchema = z.object({
  authenticated: z.literal(false),
});

export type LoggedOutSession = z.infer<typeof loggedOutSessionSchema>;

export const healthSchema = z.object({ status: z.literal('ok') });
export type Health = z.infer<typeof healthSchema>;
