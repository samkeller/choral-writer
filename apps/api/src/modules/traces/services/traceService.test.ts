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
    response: 'Story.',
    inputTokens: 2,
    outputTokens: 3,
    durationMs: 20,
    status: 'success',
    createdAt: new Date(),
    costMicroUsd: null,
    costBasis: null,
  };
}

function repositoryMock(overrides: Partial<Record<'listByTurn' | 'listByTurns' | 'configurationsByTurn' | 'findByIdForTurn', ReturnType<typeof vi.fn>>> = {}) {
  return {
    listByTurn: vi.fn(async () => []),
    listByTurns: vi.fn(async () => []),
    configurationsByTurn: vi.fn(async () => new Map()),
    findByIdForTurn: vi.fn(async () => null),
    ...overrides,
  };
}

function turnLookup(overrides: Partial<Record<'turn' | 'turnConfiguration' | 'history', ReturnType<typeof vi.fn>>> = {}) {
  return {
    turn: vi.fn(async () => ({ id: turnId })),
    turnConfiguration: vi.fn(async () => null),
    history: vi.fn(async () => ({ turns: [] })),
    ...overrides,
  };
}

describe('TraceService', () => {
  it('validates project ownership before reading a turn summary', async () => {
    const call = trace();
    const turns = turnLookup();
    const repository = repositoryMock({
      listByTurn: vi.fn(async () => [call]),
      findByIdForTurn: vi.fn(async () => call),
    });

    const summary = await new TraceService(repository, turns).summary(projectId, turnId);

    expect(turns.turn).toHaveBeenCalledWith(projectId, turnId);
    expect(repository.listByTurn).toHaveBeenCalledWith(turnId);
    expect(summary.turnId).toBe(turnId);
  });

  it('returns the configuration the turn ran with, or null for a turn that predates recording', async () => {
    const configuration = { systemPrompt: 'Prompt.', agents: [] };
    const repository = repositoryMock();
    const recorded = turnLookup({ turnConfiguration: vi.fn(async () => configuration) });
    const legacy = turnLookup();

    expect((await new TraceService(repository, recorded).summary(projectId, turnId)).configuration).toEqual(configuration);
    expect(recorded.turnConfiguration).toHaveBeenCalledWith(projectId, turnId);
    expect((await new TraceService(repository, legacy).summary(projectId, turnId)).configuration).toBeNull();
  });

  it('restricts call details to the requested turn', async () => {
    const turns = turnLookup();
    const repository = repositoryMock();

    await expect(new TraceService(repository, turns).call(projectId, turnId, callId))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(repository.findByIdForTurn).toHaveBeenCalledWith(callId, turnId);
  });

  it('does not query traces when the turn does not belong to the project', async () => {
    const turns = turnLookup({ turn: vi.fn().mockRejectedValue(new Error('Turn not found.')) });
    const repository = repositoryMock();

    await expect(new TraceService(repository, turns).summary(projectId, turnId))
      .rejects.toThrow('Turn not found.');
    expect(repository.listByTurn).not.toHaveBeenCalled();
  });

  it('measures every turn of the branch path and compares each configuration with the previous turn', async () => {
    const firstTurnId = '019ad30c-19b0-7000-8000-000000000211';
    const legacyTurnId = '019ad30c-19b0-7000-8000-000000000212';
    const lastTurnId = '019ad30c-19b0-7000-8000-000000000213';
    const branchId = '019ad30c-19b0-7000-8000-000000000214';
    const narrator = { ...trace(), turnId: lastTurnId, inputTokens: 900, costMicroUsd: 120 };
    const turns = turnLookup({
      history: vi.fn(async () => ({ turns: [{ id: firstTurnId }, { id: legacyTurnId }, { id: lastTurnId }] })),
    });
    const repository = repositoryMock({
      listByTurns: vi.fn(async () => [narrator]),
      configurationsByTurn: vi.fn(async () => new Map([
        [firstTurnId, { systemPrompt: 'Prompt.', agents: [] }],
        [lastTurnId, { systemPrompt: 'Prompt modifié.', agents: [] }],
      ])),
    });

    const metrics = await new TraceService(repository, turns).branchMetrics(projectId, branchId);

    expect(turns.history).toHaveBeenCalledWith(projectId, branchId);
    expect(metrics.map((turn) => turn.turnId)).toEqual([firstTurnId, legacyTurnId, lastTurnId]);
    expect(metrics.map((turn) => turn.configurationChanges)).toEqual([null, null, null]);
    expect(metrics[2]).toMatchObject({ durationMs: 20, narratorInputTokens: 900, cost: { microUsd: 120, complete: true } });
    expect(metrics[0]).toMatchObject({ durationMs: 0, narratorInputTokens: null, cost: { microUsd: 0, complete: true } });
  });

  it('reports configuration changes between two recorded turns', async () => {
    const firstTurnId = '019ad30c-19b0-7000-8000-000000000221';
    const nextTurnId = '019ad30c-19b0-7000-8000-000000000222';
    const turns = turnLookup({ history: vi.fn(async () => ({ turns: [{ id: firstTurnId }, { id: nextTurnId }] })) });
    const repository = repositoryMock({
      configurationsByTurn: vi.fn(async () => new Map([
        [firstTurnId, { systemPrompt: 'Prompt.', agents: [] }],
        [nextTurnId, { systemPrompt: 'Autre prompt.', agents: [] }],
      ])),
    });

    const metrics = await new TraceService(repository, turns).branchMetrics(projectId, turnId);

    expect(metrics.map((turn) => turn.configurationChanges)).toEqual([null, [{ kind: 'systemPromptChanged' }]]);
  });
});
