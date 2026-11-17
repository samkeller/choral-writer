import cookie from '@fastify/cookie';
import Fastify, { FastifyServerOptions, LogController } from 'fastify';
import { apiErrorSchema, healthSchema } from '@choral-writer/shared';

import { parseResponseDto } from './http/responseDto.js';
import type { AuthConfig } from './config.js';
import { registerAuthRoutes } from './auth/routes.js';
import { toPublicError } from './errors/errors.js';
import { registerProjectRoutes } from './modules/projects/routes/projectRoutes.js';
import type { ProjectsService } from './modules/projects/services/projectServices.js';
import { registerAgentRoutes } from './modules/agents/routes/agentRoutes.js';
import type { AgentsService } from './modules/agents/services/agentsService.js';
import { ChatController, type ChatService } from './modules/chat/index.js';
import { notfoundError } from './errors/errors.js';
import { registerChatRoutes } from './modules/chat/routes/chatRoutes.js';

export function buildApp(
  config: AuthConfig,
  services?: { projects: ProjectsService; agents: AgentsService; chat: ChatService },
) {

  const isDevelopment = config.nodeEnv === 'development';

  let logger: FastifyServerOptions["logger"] | undefined = {
    level: isDevelopment ? 'debug' : 'info',
    /**
    * Dev: prettify logs with pino-pretty
    */
    ...(config.nodeEnv === 'development' && {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
          singleLine: true,
        },
      },
    }),
  };

  const app = Fastify({
    logger,
    logController: new LogController({
      disableRequestLogging: isDevelopment,
    })
  });

  app.register(cookie, { secret: config.cookieSecret });

  app.setErrorHandler((error, request, reply) => {
    const publicError = toPublicError(error);
    request.log.error(
      { err: error, code: publicError.code, statusCode: publicError.status },
      'Request failed',
    );
    return reply.code(publicError.status).send(parseResponseDto(apiErrorSchema, { error: publicError }));
  });

  app.setNotFoundHandler((_request, reply) => {
    notfoundError('Route not found.');
  });

  app.get('/healthz', async () => parseResponseDto(healthSchema, { status: 'ok' }));
  registerAuthRoutes(app, config);
  if (services) {
    registerProjectRoutes(app, services.projects);
    registerAgentRoutes(app, services.agents);
    registerChatRoutes(app, new ChatController(services.chat));
  }

  return app;
}
