import type { FastifyInstance } from 'fastify';

import { requireAuth } from '../../../auth/routes.js';
import type { ChatController } from '../controllers/chatController.js';

export function registerChatRoutes(app: FastifyInstance, controller: ChatController): void {

  app.get('/api/projects/:projectId/branches', { preHandler: requireAuth },
    (request) => controller.getChatBranches(request)
  );

  app.get('/api/projects/:projectId/turns/:turnId', { preHandler: requireAuth },
    (request) => controller.getChatTurn(request)
  );

  const branchPath = '/api/projects/:projectId/branches/:branchId';
  app.get(`${branchPath}/history`, { preHandler: requireAuth },
    (request) => controller.getChatHistory(request)
  );

  app.post(`${branchPath}/turns`, { preHandler: requireAuth },
    (request, reply) => controller.sendChat(request, reply)
  );

  app.post(`${branchPath}/turns/:turnId/regenerate`, { preHandler: requireAuth },
    (request, reply) => controller.replayChat(request, reply, 'regenerate')
  );

  app.post(`${branchPath}/turns/:turnId/retry`, { preHandler: requireAuth },
    (request, reply) => controller.replayChat(request, reply, 'retry')
  );
}
