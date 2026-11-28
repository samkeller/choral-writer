import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../../auth/routes.js';
import type { AttributionController } from '../controllers/attributionController.js';

/** A POST: the first request may pay for an LLM call, which a GET must never do. */
export function registerAttributionRoutes(app: FastifyInstance, controller: AttributionController): void {
  app.post('/api/projects/:projectId/turns/:turnId/attribution', { preHandler: requireAuth },
    (request) => controller.attributeTurn(request));
}
