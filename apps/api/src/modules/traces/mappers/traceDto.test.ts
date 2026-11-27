import { describe, expect, it } from 'vitest';
import type { AttributedDevelopment } from '@choral-writer/shared';

import type { MetricCallRecord, TraceDetailRecord } from '../repositories/traceRepository.js';
import { toTraceCallDetailDto, toTraceCallSummaryDto, toTurnMetricsDto, toTurnTraceSummaryDto } from './traceDto.js';

const turnId = '019ad30c-19b0-7000-8000-000000000101';
const analysisAgentId = '019ad30c-19b0-7000-8000-000000000102';
const analysisVersionId = '019ad30c-19b0-7000-8000-000000000103';
const analysisCallId = '019ad30c-19b0-7000-8000-000000000104';
const narratorCallId = '019ad30c-19b0-7000-8000-000000000105';

const runningTurn = { id: turnId, configuration: null, direction: null, developments: null, completedAt: null };

/** A call as both the trace summary and the turn metrics read it. */
type RecordedCall = TraceDetailRecord & MetricCallRecord;

function trace(overrides: Partial<RecordedCall> = {}): RecordedCall {
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
    composition: null,
    narratorComposition: null,
    ...overrides,
  };
}

describe('trace DTO mapping', () => {
  it('exposes the recorded composition of each call, and of the Narrator call in the turn metrics', () => {
    const composition = [
      { part: 'systemPrompt', estimatedTokens: 120 },
      { part: 'history', estimatedTokens: 480 },
      { part: 'input', estimatedTokens: 15 },
    ];
    const narrator = trace({
      status: 'success', response: 'Prose.', inputTokens: 640, composition, narratorComposition: composition,
    });

    expect(toTraceCallSummaryDto(narrator, turnId).composition).toEqual(composition);
    expect(toTurnMetricsDto(runningTurn, [narrator], null).narratorComposition).toEqual(composition);
  });

  it('reports no composition for a call recorded before compositions, or with an unreadable one', () => {
    expect(toTraceCallSummaryDto(trace({ composition: null }), turnId).composition).toBeNull();
    expect(toTraceCallSummaryDto(trace({ composition: [{ part: 'unknown', estimatedTokens: -1 }] }), turnId).composition)
      .toBeNull();
    expect(toTurnMetricsDto(runningTurn, [trace({ composition: null })], null).narratorComposition).toBeNull();
    expect(toTurnMetricsDto(runningTurn, [], null).narratorComposition).toBeNull();
  });

  it('times each stage by its slowest parallel agent, retries included, and sums stages into the turn duration', () => {
    const otherAgentId = '019ad30c-19b0-7000-8000-000000000107';
    const traces = [
      trace({ id: analysisCallId, stage: 'analysis', agentId: analysisAgentId, agentVersionId: analysisVersionId, durationMs: 800 }),
      trace({ id: '019ad30c-19b0-7000-8000-000000000108', stage: 'analysis', agentId: otherAgentId, durationMs: 1000 }),
      trace({ id: '019ad30c-19b0-7000-8000-000000000109', stage: 'analysis', agentId: analysisAgentId, agentVersionId: analysisVersionId, durationMs: 700 }),
      trace({ durationMs: 2000, inputTokens: 640 }),
      trace({ id: '019ad30c-19b0-7000-8000-000000000110', stage: 'guardian', durationMs: 300 }),
    ];

    expect(toTurnTraceSummaryDto(runningTurn, traces).timeline).toEqual([
      { stage: 'analysis', durationMs: 1500, agentCount: 2 },
      { stage: 'narrator', durationMs: 2000, agentCount: 1 },
      { stage: 'guardian', durationMs: 300, agentCount: 1 },
    ]);
    expect(toTurnMetricsDto(runningTurn, traces, [])).toMatchObject({ durationMs: 3800, narratorInputTokens: 640 });
  });

  it('leaves a later memory retry out of the turn duration but keeps its cost', () => {
    const completedAt = new Date('2025-01-01T00:00:10.000Z');
    const narrator = trace({ durationMs: 2000, costMicroUsd: 100, createdAt: new Date('2025-01-01T00:00:05.000Z') });
    const guardian = trace({
      id: '019ad30c-19b0-7000-8000-000000000111', stage: 'guardian', durationMs: 500, costMicroUsd: 10,
      createdAt: new Date('2025-01-01T00:00:09.000Z'),
    });
    const retry = trace({
      id: '019ad30c-19b0-7000-8000-000000000112', stage: 'guardian', durationMs: 60_000, costMicroUsd: 20,
      createdAt: new Date('2025-01-01T01:00:00.000Z'),
    });
    const finished = { id: turnId, configuration: null, direction: null, developments: null, completedAt };

    const summary = toTurnTraceSummaryDto(finished, [narrator, guardian, retry]);
    expect(summary.timeline).toEqual([
      { stage: 'narrator', durationMs: 2000, agentCount: 1 },
      { stage: 'guardian', durationMs: 500, agentCount: 1 },
    ]);
    expect(summary).toMatchObject({ durationMs: 2500, cost: { microUsd: 130, complete: true } });
    expect(summary.calls).toHaveLength(3);
    expect(toTurnMetricsDto(finished, [narrator, guardian, retry], null)).toMatchObject({ durationMs: 2500 });
  });

  it('counts each call of an unknown agent apart, in the timeline as in the whiteboard', () => {
    const unknown = (id: string, durationMs: number) => trace({ id, stage: 'analysis', durationMs });
    const calls = [unknown('019ad30c-19b0-7000-8000-000000000113', 400), unknown('019ad30c-19b0-7000-8000-000000000114', 900)];

    const summary = toTurnTraceSummaryDto(runningTurn, calls);

    expect(summary.timeline).toEqual([{ stage: 'analysis', durationMs: 900, agentCount: 2 }]);
    expect(summary.analysis).toHaveLength(2);
  });

  it('totals the cost of a turn and flags it as partial when a call has no known amount', () => {
    const priced = trace({ id: analysisCallId, stage: 'analysis', costMicroUsd: 1200, costBasis: 'priced' });
    const narrator = trace({ costMicroUsd: 3400, costBasis: 'priced' });
    const unpriced = trace({ id: '019ad30c-19b0-7000-8000-000000000106', costBasis: 'unpriced' });

    expect(toTurnTraceSummaryDto(runningTurn, [priced, narrator]).cost)
      .toEqual({ microUsd: 4600, complete: true });
    expect(toTurnTraceSummaryDto(runningTurn, [priced, unpriced]).cost)
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

    const summary = toTurnTraceSummaryDto(runningTurn, [analysis, narrator]);

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

    const summary = toTurnTraceSummaryDto(runningTurn, [failed]);
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

    const summary = toTurnTraceSummaryDto(runningTurn, [invalid, retry]);

    expect(summary.analysis).toHaveLength(1);
    expect(summary.analysis[0]).toMatchObject({
      status: 'success', attempts: 2, durationMs: 70, envelope: { summary: 'Validated.' },
    });
  });

  it('summarizes the direction phase with its recorded direction, cost and attempts', () => {
    const direction = { tension: 'tenir' as const, nudges: [], retained: [], dismissed: [] };
    const invalid = trace({
      id: analysisCallId, stage: 'direction', agentName: 'Director', durationMs: 30, costMicroUsd: 100, costBasis: 'priced',
    });
    const valid = trace({
      id: '019ad30c-19b0-7000-8000-000000000107', stage: 'direction', agentName: 'Director',
      status: 'success', durationMs: 40, costMicroUsd: 200, costBasis: 'priced',
    });

    expect(toTurnTraceSummaryDto({ ...runningTurn, direction }, [invalid, valid])).toMatchObject({
      direction: {
        name: 'Director', status: 'success', attempts: 2, durationMs: 70, direction,
        cost: { microUsd: 300, complete: true },
      },
      cost: { microUsd: 300, complete: true },
    });
    expect(toTurnTraceSummaryDto(runningTurn, [invalid, trace({ costBasis: 'unpriced' })]).direction)
      .toMatchObject({ status: 'error', direction: null, attempts: 1, cost: { microUsd: 100, complete: true } });
    expect(toTurnTraceSummaryDto(runningTurn, []).direction).toBeNull();
  });

  it('splits the developments of the turn into scene and off-screen, and keeps older turns apart', () => {
    const scene: AttributedDevelopment = { agent: 'Monde', item: {
      kind: 'development', characters: ['Mara'], scope: 'scene', text: 'La lampe s’éteint.', importance: 'HIGH',
    } };
    const offscreen: AttributedDevelopment = { agent: 'Absents', item: {
      kind: 'development', characters: [], scope: 'offscreen', text: 'Un orage approche.', importance: 'LOW',
    } };

    expect(toTurnTraceSummaryDto({ ...runningTurn, developments: [offscreen, scene] }, []).developments)
      .toEqual({ scene: [scene], offscreen: [offscreen] });
    expect(toTurnTraceSummaryDto({ ...runningTurn, developments: [] }, []).developments)
      .toEqual({ scene: [], offscreen: [] });
    expect(toTurnTraceSummaryDto(runningTurn, []).developments).toBeNull();
  });

  it('reduces the direction of a turn to its tension and nudge types, telling a failed direction from none', () => {
    const direction = {
      tension: 'monter' as const,
      nudges: [{ type: 'complication' as const, target: 'Personnage A', basis: null }],
      retained: [],
      dismissed: [],
    };
    const directorCall = trace({ stage: 'direction' });

    expect(toTurnMetricsDto({ ...runningTurn, direction }, [directorCall], null).direction)
      .toEqual({ status: 'success', tension: 'monter', nudges: ['complication'] });
    expect(toTurnMetricsDto(runningTurn, [directorCall], null).direction).toEqual({ status: 'error' });
    expect(toTurnMetricsDto(runningTurn, [trace()], null).direction).toBeNull();
  });
});
