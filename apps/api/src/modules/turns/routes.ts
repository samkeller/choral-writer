import type { FastifyInstance } from 'fastify';
import { messageInputSchema, projectParamsSchema, type ChatEvent } from '@choral-writer/shared';

import { requireAuth } from '../../auth/routes.js';
import { toPublicError } from '../../errors.js';
import type { TurnsService } from './service.js';

export function registerTurnRoutes(app: FastifyInstance, service: TurnsService): void {
  app.get('/api/projects/:projectId/messages', { preHandler: requireAuth }, (request) => {
    return service.history(projectParamsSchema.parse(request.params).projectId);
  });

  app.post('/api/projects/:projectId/turns', { preHandler: requireAuth }, async (request, reply) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const { content } = messageInputSchema.parse(request.body);
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(new DOMException('Turn timed out.', 'TimeoutError')), 120_000);
    const abort = () => controller.abort();
    reply.raw.on('close', abort);
    let streaming = false;

    async function emit(event: ChatEvent): Promise<void> {
      if (reply.raw.destroyed) throw new Error('The client disconnected.');
      if (controller.signal.aborted && event.type !== 'chat.turn.failed') throw controller.signal.reason;
      if (!streaming) {
        reply.hijack();
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no',
          Connection: 'keep-alive',
        });
        streaming = true;
      }
      const ready = reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      if (!ready) {
        await new Promise<void>((resolve, reject) => {
          const cleanup = () => {
            reply.raw.off('drain', drained);
            controller.signal.removeEventListener('abort', disconnected);
          };
          const drained = () => { cleanup(); resolve(); };
          const disconnected = () => { cleanup(); reject(new Error('The client disconnected.')); };
          reply.raw.once('drain', drained);
          controller.signal.addEventListener('abort', disconnected, { once: true });
          if (controller.signal.aborted) disconnected();
        });
      }
    }

    const heartbeat = setInterval(() => {
      if (streaming && !controller.signal.aborted) reply.raw.write(': keep-alive\n\n');
    }, 15_000);

    try {
      const result = await service.run(projectId, content, emit, controller.signal);
      if (result.status === 'failed') {
        request.log.error({ err: result.error, turnId: result.turnId }, 'Turn generation failed.');
        if (!reply.raw.destroyed) {
          await emit({
            type: 'chat.turn.failed',
            turnId: result.turnId,
            error: toPublicError(result.error),
          });
        }
      } else {
        await emit({ type: 'chat.turn.completed', turnId: result.turnId, message: result.message });
      }
    } catch (error) {
      if (!streaming) throw error;
      request.log.error({ err: error }, 'Streamed turn failed.');
      if (!reply.raw.destroyed) {
        await emit({
          type: 'chat.turn.failed',
          error: toPublicError(error),
        });
      }
    } finally {
      clearTimeout(deadline);
      clearInterval(heartbeat);
      reply.raw.off('close', abort);
      if (streaming) reply.raw.end();
    }
  });
}
