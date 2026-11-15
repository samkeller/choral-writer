import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Settings } from './types.js';

const loginSchema = z.object({ password: z.string().max(1024) }).strict();

export function registerAuthRoutes(app: FastifyInstance, settings: Settings) {
  app.post(
    '/api/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = loginSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'Invalid request' });
      const supplied = createHash('sha256').update(body.data.password).digest();
      const expected = createHash('sha256').update(settings.password).digest();
      if (!timingSafeEqual(supplied, expected)) return reply.code(401).send({ error: 'Invalid password' });
      return reply
        .setCookie('session', String(Date.now() + 24 * 60 * 60 * 1000), {
          signed: true,
          httpOnly: true,
          sameSite: 'strict',
          secure: settings.secureCookies,
          path: '/',
          maxAge: 60 * 60 * 24,
        })
        .send({ ok: true });
    },
  );

  app.addHook('preHandler', async (request, reply) => {
    if (!request.url.startsWith('/api/') || request.url === '/api/login') return;
    const value = request.cookies.session;
    const session = value ? request.unsignCookie(value) : undefined;
    if (
      !session?.valid ||
      !session.value ||
      !/^\d+$/.test(session.value) ||
      Number(session.value) <= Date.now()
    ) {
      return reply.code(401).send({ error: 'Authentication required' });
    }
  });

  app.post('/api/logout', async (_request, reply) => {
    return reply.clearCookie('session', { path: '/' }).send({ ok: true });
  });
}
