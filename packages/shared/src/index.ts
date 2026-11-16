import { z } from 'zod';

export * from './projects.js';
export * from './chat/index.js';
export * from './errors.js';

export const loginRequestSchema = z.object({
  password: z.string().min(1).max(512),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const authenticatedSessionSchema = z.object({
  authenticated: z.literal(true),
});

export type AuthenticatedSession = z.infer<typeof authenticatedSessionSchema>;
