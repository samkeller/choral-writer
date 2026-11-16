import { timingSafeEqual } from 'node:crypto';

import { loginRequestSchema } from '@choral-writer/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { AuthConfig } from '../config.js';

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
  reply: FastifyReply,
): Promise<void> {
  const signedValue = request.cookies[AUTH_COOKIE];
  if (!signedValue) {
    await reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } });
    return;
  }

  const result = request.unsignCookie(signedValue);
  if (!result.valid || result.value !== AUTH_COOKIE_VALUE) {
    await reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } });
  }
}

export function registerAuthRoutes(app: FastifyInstance, config: AuthConfig): void {
  app.post('/api/login', async (request, reply) => {
    const parsed = loginRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'INVALID_REQUEST', message: 'A password is required.' },
      });
    }
    if (!passwordsMatch(parsed.data.password, config.appPassword)) {
      return reply.code(401).send({
        error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect password.' },
      });
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
