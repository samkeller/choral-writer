import type { FastifyReply, FastifyRequest } from 'fastify';
import { chatEventDtoSchema, type ChatEvent } from '@choral-writer/shared';
import { parseResponseDto } from '../../../http/responseDto.js';
import { toPublicError } from '../../../errors/errors.js';
import type { ChatProgressEvent, ChatRunResult } from '../types/chat.types.js';
import { toChatEventDto } from '../mappers/eventDto.js';

/** SSE lifecycle shared by all chat commands; terminal success follows DB commit. */
export async function streamChatCommand(
  request: FastifyRequest,
  reply: FastifyReply,
  run: (
    emit: (event: ChatProgressEvent) => Promise<void>,
    signal: AbortSignal,
  ) => Promise<ChatRunResult>,
): Promise<void> {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(new DOMException('Turn timed out.', 'TimeoutError')), 120_000);
  const abort = () => controller.abort();
  reply.raw.on('close', abort);
  let streaming = false;

  async function emit(event: ChatEvent): Promise<void> {
    const dto = parseResponseDto(chatEventDtoSchema, toChatEventDto(event));
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
    const ready = reply.raw.write(`event: ${dto.type}\ndata: ${JSON.stringify(dto)}\n\n`);
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
    const result = await run(emit, controller.signal);
    if (result.status === 'failed') {
      request.log.error({ err: result.error, turnId: result.turnId }, 'Turn generation failed.');
      if (!reply.raw.destroyed) {
        await emit({
          type: 'chat.turn.failed',
          turnId: result.turnId,
          branchId: result.branchId,
          error: toPublicError(result.error),
        });
      }
    } else {
      await emit({
        type: 'chat.turn.completed', branchId: result.branchId,
        turnId: result.turnId, message: result.message,
      });
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
}
