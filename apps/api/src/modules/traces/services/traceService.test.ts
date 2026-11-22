import { describe, expect, it, vi } from 'vitest';
import type { TurnConfiguration } from '@choral-writer/shared';

import type { MetricCallRecord, TraceDetailRecord, TracedTurnRecord } from '../repositories/traceRepository.js';
import { TraceService } from './traceService.js';

const projectId = '019ad30c-19b0-7000-8000-000000000201';
const turnId = '019ad30c-19b0-7000-8000-000000000202';
const callId = '019ad30c-19b0-7000-8000-000000000203';
const branchId = '019ad30c-19b0-7000-8000-000000000204';

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

function tracedTurn(id: string, parentTurnId: string | null, configuration: TurnConfiguration | null = null): TracedTurnRecord {
  return { id, parentTurnId, configuration, completedAt: null };
}

type RepositoryMethod = 'findTurn' | 'findBranchHead' | 'listAncestry' | 'listMetricCalls' | 'listByTurn' | 'findByIdForTurn';

function repositoryMock(overrides: Partial<Record<RepositoryMethod, ReturnType<typeof vi.fn>>> = {}) {
  return {
    findTurn: vi.fn(async () => ({ ...tracedTurn(turnId, null), direction: null, developments: null })),
    findBranchHead: vi.fn(async () => null),
    listAncestry: vi.fn(async () => []),
    listMetricCalls: vi.fn(async () => []),
    listByTurn: vi.fn(async () => []),
    findByIdForTurn: vi.fn(async () => null),
    ...overrides,
  };
}

describe('TraceService', () => {
  it('validates project ownership before reading a turn summary', async () => {
    const repository = repositoryMock({ listByTurn: vi.fn(async () => [trace()]) });

    const summary = await new TraceService(repository).summary(projectId, turnId);

    expect(repository.findTurn).toHaveBeenCalledWith(projectId, turnId);
    expect(repository.listByTurn).toHaveBeenCalledWith(turnId);
    expect(summary.turnId).toBe(turnId);
  });

  it('returns the configuration the turn ran with, or null for a turn that predates recording', async () => {
    const configuration = { systemPrompt: 'Prompt.', agents: [] };
    const recorded = repositoryMock({ findTurn: vi.fn(async () => ({ ...tracedTurn(turnId, null, configuration), direction: null, developments: null })) });

    expect((await new TraceService(recorded).summary(projectId, turnId)).configuration).toEqual(configuration);
    expect((await new TraceService(repositoryMock()).summary(projectId, turnId)).configuration).toBeNull();
  });

  it('restricts call details to the requested turn', async () => {
    const repository = repositoryMock();

    await expect(new TraceService(repository).call(projectId, turnId, callId))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(repository.findByIdForTurn).toHaveBeenCalledWith(callId, turnId);
  });

  it('does not query traces when the turn does not belong to the project', async () => {
    const repository = repositoryMock({ findTurn: vi.fn(async () => null) });

    await expect(new TraceService(repository).summary(projectId, turnId)).rejects.toMatchObject({ statusCode: 404 });
    expect(repository.listByTurn).not.toHaveBeenCalled();
  });

  it('rejects metrics of a branch outside the project, and returns none for an empty branch', async () => {
    await expect(new TraceService(repositoryMock({ findBranchHead: vi.fn(async () => undefined) }))
      .branchMetrics(projectId, branchId)).rejects.toMatchObject({ statusCode: 404 });

    const empty = repositoryMock();
    expect(await new TraceService(empty).branchMetrics(projectId, branchId)).toEqual([]);
    expect(empty.listAncestry).not.toHaveBeenCalled();
  });

  it('measures every turn from the root, comparing each configuration with the previous turn', async () => {
    const firstTurnId = '019ad30c-19b0-7000-8000-000000000211';
    const legacyTurnId = '019ad30c-19b0-7000-8000-000000000212';
    const thirdTurnId = '019ad30c-19b0-7000-8000-000000000213';
    const lastTurnId = '019ad30c-19b0-7000-8000-000000000214';
    const narrator: MetricCallRecord = {
      id: callId, turnId: lastTurnId, agentId: null, agentVersionId: null, stage: 'narrator',
      inputTokens: 900, durationMs: 20, createdAt: new Date(), costMicroUsd: 120,
    };
    const repository = repositoryMock({
      findBranchHead: vi.fn(async () => lastTurnId),
      // Unordered, as the database returns them.
      listAncestry: vi.fn(async () => [
        tracedTurn(thirdTurnId, legacyTurnId, { systemPrompt: 'Prompt.', agents: [] }),
        tracedTurn(lastTurnId, thirdTurnId, { systemPrompt: 'Prompt modifié.', agents: [] }),
        tracedTurn(firstTurnId, null, { systemPrompt: 'Prompt.', agents: [] }),
        tracedTurn(legacyTurnId, firstTurnId),
      ]),
      listMetricCalls: vi.fn(async () => [narrator]),
    });

    const metrics = await new TraceService(repository).branchMetrics(projectId, branchId);

    expect(repository.listAncestry).toHaveBeenCalledWith(projectId, lastTurnId);
    expect(metrics.map((turn) => turn.turnId)).toEqual([firstTurnId, legacyTurnId, thirdTurnId, lastTurnId]);
    expect(metrics.map((turn) => turn.configurationChanges)).toEqual([null, null, null, [{ kind: 'systemPromptChanged' }]]);
    expect(metrics[3]).toMatchObject({ durationMs: 20, narratorInputTokens: 900, cost: { microUsd: 120, complete: true } });
    expect(metrics[0]).toMatchObject({ durationMs: 0, narratorInputTokens: null, cost: { microUsd: 0, complete: true } });
  });
});
