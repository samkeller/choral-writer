import { timingSafeEqual } from 'node:crypto';

import { loginRequestSchema } from '@choral-writer/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { AuthConfig } from '../config.js';
import { ApiError } from '../errors.js';

const AUTH_COOKIE = 'cw_auth';
const AUTH_COOKIE_VALUE = 'authenticated';

function passwordsMatch(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length
    && timingSafeEqual(providedBuffer, expectedBuffer);
}

export async function requireAuth(
  request: FastifyRequest,
): Promise<void> {
  const signedValue = request.cookies[AUTH_COOKIE];
  if (!signedValue) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Authentication required.');
  }

  const result = request.unsignCookie(signedValue);
  if (!result.valid || result.value !== AUTH_COOKIE_VALUE) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Authentication required.');
  }
}

export function registerAuthRoutes(app: FastifyInstance, config: AuthConfig): void {
  app.post('/api/login', async (request, reply) => {
    const parsed = loginRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ApiError(400, 'INVALID_REQUEST', 'A password is required.');
    }
    if (!passwordsMatch(parsed.data.password, config.appPassword)) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Incorrect password.');
    }

    return reply
      .setCookie(AUTH_COOKIE, AUTH_COOKIE_VALUE, {
        signed: true,
        httpOnly: true,
        sameSite: 'strict',
        secure: config.nodeEnv === 'production',
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
      })
      .send({ authenticated: true });
  });

  app.get('/api/session', { preHandler: requireAuth }, async () => ({ authenticated: true }));

  app.post('/api/logout', async (_request, reply) => {
    return reply
      .clearCookie(AUTH_COOKIE, { path: '/' })
      .send({ authenticated: false });
  });
}
