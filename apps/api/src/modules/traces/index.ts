import type { Database } from '../../db/client.js';
import type { createCallLLM } from '../../llm/call-llm.js';
import { AttributionRepository } from './repositories/attributionRepository.js';
import { TraceRepository } from './repositories/traceRepository.js';
import { AttributionService } from './services/attributionService.js';
import { TraceService } from './services/traceService.js';

export { TraceController } from './controllers/traceController.js';
export { registerTraceRoutes } from './routes/traceRoutes.js';
export { AttributionController } from './controllers/attributionController.js';
export { registerAttributionRoutes } from './routes/attributionRoutes.js';
export type { TraceService } from './services/traceService.js';
export type { AttributionService } from './services/attributionService.js';

export function createTraceService(database: Database): TraceService {
  return new TraceService(new TraceRepository(database));
}

export function createAttributionService(
  database: Database, callLLM: ReturnType<typeof createCallLLM>, traces: TraceService,
): AttributionService {
  return new AttributionService(callLLM, new AttributionRepository(database),
    (projectId, turnId) => traces.summary(projectId, turnId));
}
