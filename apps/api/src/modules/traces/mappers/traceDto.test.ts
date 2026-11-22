import { describe, expect, it } from 'vitest';

import type { TraceDetailRecord } from '../repositories/traceRepository.js';
import { toTraceCallDetailDto, toTraceCallSummaryDto, toTurnMetricsDto, toTurnTraceSummaryDto } from './traceDto.js';

const turnId = '019ad30c-19b0-7000-8000-000000000101';
const analysisAgentId = '019ad30c-19b0-7000-8000-000000000102';
const analysisVersionId = '019ad30c-19b0-7000-8000-000000000103';
const analysisCallId = '019ad30c-19b0-7000-8000-000000000104';
const narratorCallId = '019ad30c-19b0-7000-8000-000000000105';

function trace(overrides: Partial<TraceDetailRecord> = {}): TraceDetailRecord {
  return {
    id: narratorCallId,
    turnId,
    agentId: null,
    agentVersionId: null,
    agentName: null,
    agentVersion: null,
    stage: 'narrator',
    model: 'test-model',
    request: { messages: [{ role: 'system', content: 'System prompt.' }] },
    response: null,
    inputTokens: null,
    outputTokens: null,
    durationMs: 1250,
    status: 'error',
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    costMicroUsd: null,
    costBasis: null,
    ...overrides,
  };
}

describe('trace DTO mapping', () => {
  it('times each stage by its slowest parallel agent, retries included, and sums stages into the turn duration', () => {
    const otherAgentId = '019ad30c-19b0-7000-8000-000000000107';
    const traces = [
      trace({ id: analysisCallId, stage: 'analysis', agentId: analysisAgentId, agentVersionId: analysisVersionId, durationMs: 800 }),
      trace({ id: '019ad30c-19b0-7000-8000-000000000108', stage: 'analysis', agentId: otherAgentId, durationMs: 1000 }),
      trace({ id: '019ad30c-19b0-7000-8000-000000000109', stage: 'analysis', agentId: analysisAgentId, agentVersionId: analysisVersionId, durationMs: 700 }),
      trace({ durationMs: 2000, inputTokens: 640 }),
      trace({ id: '019ad30c-19b0-7000-8000-000000000110', stage: 'guardian', durationMs: 300 }),
    ];

    expect(toTurnTraceSummaryDto(turnId, traces, null).timeline).toEqual([
      { stage: 'analysis', durationMs: 1500, agentCount: 2 },
      { stage: 'narrator', durationMs: 2000, agentCount: 1 },
      { stage: 'guardian', durationMs: 300, agentCount: 1 },
    ]);
    expect(toTurnMetricsDto(turnId, traces, [])).toMatchObject({ durationMs: 3800, narratorInputTokens: 640 });
  });

  it('totals the cost of a turn and flags it as partial when a call has no known amount', () => {
    const priced = trace({ id: analysisCallId, stage: 'analysis', costMicroUsd: 1200, costBasis: 'priced' });
    const narrator = trace({ costMicroUsd: 3400, costBasis: 'priced' });
    const unpriced = trace({ id: '019ad30c-19b0-7000-8000-000000000106', costBasis: 'unpriced' });

    expect(toTurnTraceSummaryDto(turnId, [priced, narrator], null).cost)
      .toEqual({ microUsd: 4600, complete: true });
    expect(toTurnTraceSummaryDto(turnId, [priced, unpriced], null).cost)
      .toEqual({ microUsd: 1200, complete: false });
    expect(toTraceCallSummaryDto(narrator, turnId)).toMatchObject({ costMicroUsd: 3400, costBasis: 'priced' });
  });

  it('reconstructs the analysis whiteboard and narrator prose from persisted calls', () => {
    const analysis = trace({
      id: analysisCallId,
      agentId: analysisAgentId,
      agentVersionId: analysisVersionId,
      agentName: 'Chaos',
      agentVersion: 2,
      stage: 'analysis',
      status: 'success',
      response: JSON.stringify({
        v: 1, agent: 'Chaos', summary: 'The door may be trapped.',
        items: [{ kind: 'observation', text: 'A wire is visible.', importance: 'HIGH' }],
      }),
    });
    const narrator = trace({
      status: 'success',
      response: 'Mara stops.',
    });

    const summary = toTurnTraceSummaryDto(turnId, [analysis, narrator], null);

    expect(summary.analysis).toEqual([{
      agentId: analysisAgentId,
      agentVersionId: analysisVersionId,
      name: 'Chaos',
      status: 'success',
      durationMs: 1250,
      attempts: 1,
      envelope: {
        v: 1, agent: 'Chaos', summary: 'The door may be trapped.',
        items: [{ kind: 'observation', text: 'A wire is visible.', importance: 'HIGH' }],
      },
    }]);
    expect(summary.narrator).toEqual({
      status: 'success', durationMs: 1250, prose: 'Mara stops.',
    });
    expect(summary.calls.map((call) => call.stage)).toEqual(['analysis', 'narrator']);
  });

  it('keeps malformed and failed outputs inspectable without exposing stored provider errors', () => {
    const failed = trace({
      id: analysisCallId, stage: 'analysis', agentId: analysisAgentId,
      agentVersionId: analysisVersionId, agentName: 'Chaos', response: '{"v":2}',
    });

    const summary = toTurnTraceSummaryDto(turnId, [failed], null);
    const call = toTraceCallSummaryDto(trace(), turnId);
    const detail = toTraceCallDetailDto(trace({
      status: 'success', response: 'Raw response.',
      request: { messages: [{ role: 'system', content: 'Exact prompt.' }] },
    }), turnId);

    expect(summary.analysis[0]).toMatchObject({ status: 'error', envelope: null });
    expect(call.error).toBe('L’appel LLM a échoué.');
    expect(detail.request.messages[0]?.content).toBe('Exact prompt.');
    expect(detail.response).toBe('Raw response.');
  });

  it('groups validation retries under one agent and sums their latency', () => {
    const invalid = trace({
      id: analysisCallId,
      agentId: analysisAgentId,
      agentVersionId: analysisVersionId,
      agentName: 'Chaos',
      stage: 'analysis',
      status: 'error',
      durationMs: 30,
      response: '{"v":2}',
    });
    const retry = trace({
      id: narratorCallId,
      agentId: analysisAgentId,
      agentVersionId: analysisVersionId,
      agentName: 'Chaos',
      stage: 'analysis',
      status: 'success',
      durationMs: 40,
      response: JSON.stringify({ v: 1, agent: 'Chaos', summary: 'Validated.', items: [] }),
    });

    const summary = toTurnTraceSummaryDto(turnId, [invalid, retry], null);

    expect(summary.analysis).toHaveLength(1);
    expect(summary.analysis[0]).toMatchObject({
      status: 'success', attempts: 2, durationMs: 70, envelope: { summary: 'Validated.' },
    });
  });
});
