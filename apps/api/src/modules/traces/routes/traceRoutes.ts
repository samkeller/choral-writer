import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../../auth/routes.js';
import type { TraceController } from '../controllers/traceController.js';

export function registerTraceRoutes(app: FastifyInstance, controller: TraceController): void {
  const turnPath = '/api/projects/:projectId/turns/:turnId/traces';
  app.get(turnPath, { preHandler: requireAuth }, (request) => controller.getTurnSummary(request));
  app.get(`${turnPath}/:callId`, { preHandler: requireAuth }, (request) => controller.getCallDetail(request));
}
