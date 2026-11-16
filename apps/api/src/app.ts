import cookie from '@fastify/cookie';
import Fastify from 'fastify';

import type { AuthConfig } from './config.js';
import { registerAuthRoutes } from './auth/routes.js';
import { ApiError, toPublicError } from './errors.js';
import { registerProjectRoutes } from './modules/projects/routes.js';
import type { ProjectsService } from './modules/projects/service.js';
import { registerTurnRoutes } from './modules/turns/routes.js';
import type { TurnsService } from './modules/turns/service.js';

export function buildApp(
  config: AuthConfig,
  services?: { projects: ProjectsService; turns: TurnsService },
) {
  const app = Fastify({ logger: config.nodeEnv !== 'test' });

  app.register(cookie, { secret: config.cookieSecret });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error });
    const publicError = toPublicError(error);
    return reply.code(publicError.status).send({ error: publicError });
  });

  app.setNotFoundHandler((_request, reply) => {
    throw new ApiError(404, 'NOT_FOUND', 'Route not found.');
  });

  app.get('/healthz', async () => ({ status: 'ok' }));
  registerAuthRoutes(app, config);
  if (services) {
    registerProjectRoutes(app, services.projects);
    registerTurnRoutes(app, services.turns);
  }

  return app;
}
