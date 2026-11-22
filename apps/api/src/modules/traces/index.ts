import type { Database } from '../../db/client.js';
import { TraceRepository } from './repositories/traceRepository.js';
import { TraceService } from './services/traceService.js';

export { TraceController } from './controllers/traceController.js';
export { registerTraceRoutes } from './routes/traceRoutes.js';
export type { TraceService } from './services/traceService.js';

export function createTraceService(database: Database): TraceService {
  return new TraceService(new TraceRepository(database));
}
