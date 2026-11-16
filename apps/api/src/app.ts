import cookie from '@fastify/cookie';
import Fastify from 'fastify';

import type { AuthConfig } from './config.js';
import { registerAuthRoutes } from './auth/routes.js';

export function buildApp(config: AuthConfig) {
  const app = Fastify({ logger: config.nodeEnv !== 'test' });

  app.register(cookie, { secret: config.cookieSecret });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error });
    const candidateStatusCode = typeof error === 'object' && error !== null && 'statusCode' in error
      ? error.statusCode
      : undefined;
    const statusCode = typeof candidateStatusCode === 'number'
      && candidateStatusCode >= 400
      && candidateStatusCode < 600
      ? candidateStatusCode
      : 500;
    return reply.code(statusCode).send({
      error: {
        code: statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR',
        message: statusCode === 500
          ? 'An unexpected error occurred.'
          : error instanceof Error ? error.message : 'The request could not be completed.',
      },
    });
  });

  app.setNotFoundHandler((_request, reply) => {
    return reply.code(404).send({
      error: { code: 'NOT_FOUND', message: 'Route not found.' },
    });
  });

  app.get('/healthz', async () => ({ status: 'ok' }));
  registerAuthRoutes(app, config);

  return app;
}
