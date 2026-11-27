import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import fastifyStatic from '@fastify/static';
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
import { registerTraceRoutes } from './modules/traces/routes/traceRoutes.js';
import {
  AttributionController, TraceController, registerAttributionRoutes, type AttributionService, type TraceService,
} from './modules/traces/index.js';
import type { MemoriesService } from './modules/memories/services/memoriesService.js';
import { MemoryController } from './modules/memories/controllers/memoryController.js';
import { registerMemoryRoutes } from './modules/memories/routes/memoryRoutes.js';

export function buildApp(
  config: AuthConfig,
  services?: {
    projects: ProjectsService; agents: AgentsService; chat: ChatService; traces: TraceService;
    memories?: MemoriesService; attribution?: AttributionService;
  },
) {
  const isDevelopment = config.nodeEnv === 'development';
  const servesWeb = config.nodeEnv === 'production';
  const webRoot = fileURLToPath(new URL('../../web/dist', import.meta.url));

  if (servesWeb && !existsSync(new URL('../../web/dist/index.html', import.meta.url))) {
    throw new Error('The production web build is missing. Build apps/web before starting the API.');
  }

  const logger: FastifyServerOptions["logger"] | undefined = {
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
  if (servesWeb) {
    app.register(fastifyStatic, {
      root: webRoot,
      prefix: '/',
      maxAge: '1y',
      immutable: true,
    });
  }

  app.setErrorHandler((error, request, reply) => {
    const publicError = toPublicError(error);
    request.log.error(
      { err: error, code: publicError.code, statusCode: publicError.status },
      'Request failed',
    );
    return reply.code(publicError.status).send(parseResponseDto(apiErrorSchema, { error: publicError }));
  });

  app.setNotFoundHandler((request, reply) => {
    const pathname = request.url.split('?')[0];
    const isApiRoute = pathname === '/api' || pathname.startsWith('/api/');
    if (servesWeb && request.method === 'GET' && !isApiRoute
      && request.headers.accept?.includes('text/html')) {
      return reply.type('text/html').sendFile('index.html', { maxAge: 0, immutable: false });
    }
    throw notfoundError('Route not found.');
  });

  app.get('/healthz', async () => parseResponseDto(healthSchema, { status: 'ok' }));
  if (servesWeb) {
    app.get('/', (_request, reply) =>
      reply.type('text/html').sendFile('index.html', { maxAge: 0, immutable: false }));
    app.get('/index.html', (_request, reply) =>
      reply.type('text/html').sendFile('index.html', { maxAge: 0, immutable: false }));
    // Le manifeste pilote l'installation : il ne doit pas être figé un an comme les assets hachés.
    app.get('/manifest.webmanifest', (_request, reply) =>
      reply.type('application/manifest+json').sendFile('manifest.webmanifest', { maxAge: 0, immutable: false }));
  }
  registerAuthRoutes(app, config);
  if (services) {
    registerProjectRoutes(app, services.projects);
    registerAgentRoutes(app, services.agents);
    registerChatRoutes(app, new ChatController(services.chat));
    registerTraceRoutes(app, new TraceController(services.traces));
    if (services.attribution) registerAttributionRoutes(app, new AttributionController(services.attribution));
    if (services.memories) registerMemoryRoutes(app, new MemoryController(services.memories, services.chat));
  }

  return app;
}
