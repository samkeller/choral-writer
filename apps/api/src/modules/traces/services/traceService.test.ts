import { describe, expect, it, vi } from 'vitest';

import type { TraceDetailRecord } from '../repositories/traceRepository.js';
import { TraceService } from './traceService.js';

const projectId = '019ad30c-19b0-7000-8000-000000000201';
const turnId = '019ad30c-19b0-7000-8000-000000000202';
const callId = '019ad30c-19b0-7000-8000-000000000203';

function trace(): TraceDetailRecord {
  return {
    id: callId,
    turnId,
    agentId: null,
    agentVersionId: null,
    agentName: null,
    agentVersion: null,
    stage: 'narrator',
    model: 'test-model',
    request: { messages: [{ role: 'system', content: 'Prompt.' }] },
    response: '<resolution>Facts.</resolution><prose>Story.</prose>',
    inputTokens: 2,
    outputTokens: 3,
    durationMs: 20,
    status: 'success',
    createdAt: new Date(),
  };
}

describe('TraceService', () => {
  it('validates project ownership before reading a turn summary', async () => {
    const call = trace();
    const turns = { turn: vi.fn(async () => ({ id: turnId })) };
    const repository = {
      listByTurn: vi.fn(async () => [call]),
      findByIdForTurn: vi.fn(async () => call),
    };

    const summary = await new TraceService(repository, turns).summary(projectId, turnId);

    expect(turns.turn).toHaveBeenCalledWith(projectId, turnId);
    expect(repository.listByTurn).toHaveBeenCalledWith(turnId);
    expect(summary.turnId).toBe(turnId);
  });

  it('restricts call details to the requested turn', async () => {
    const turns = { turn: vi.fn(async () => ({ id: turnId })) };
    const repository = {
      listByTurn: vi.fn(async () => []),
      findByIdForTurn: vi.fn(async () => null),
    };

    await expect(new TraceService(repository, turns).call(projectId, turnId, callId))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(repository.findByIdForTurn).toHaveBeenCalledWith(callId, turnId);
  });

  it('does not query traces when the turn does not belong to the project', async () => {
    const turns = { turn: vi.fn().mockRejectedValue(new Error('Turn not found.')) };
    const repository = {
      listByTurn: vi.fn(async () => []),
      findByIdForTurn: vi.fn(async () => null),
    };

    await expect(new TraceService(repository, turns).summary(projectId, turnId))
      .rejects.toThrow('Turn not found.');
    expect(repository.listByTurn).not.toHaveBeenCalled();
  });
});
