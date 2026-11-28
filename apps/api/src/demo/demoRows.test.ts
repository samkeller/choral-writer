import { describe, expect, it } from 'vitest';
import {
  attributedDevelopmentSchema, memoryResultSchema, memoryStateSchema, turnConfigurationSchema, turnDirectionSchema,
} from '@choral-writer/shared';

import { buildDemoProjectRows, type DemoProjectRows } from './demoRows.js';
import { demoProjects } from './demoScenario.js';

const rate = { id: '019aee10-0000-7000-8000-000000000001', inputPerMillion: 0.15, outputPerMillion: 0.6, cacheReadPerMillion: 0.003 };
const startedAt = new Date('2026-11-20T09:00:00Z');

function sequentialIds() {
  let next = 0;
  return () => `00000000-0000-7000-8000-${(++next).toString(16).padStart(12, '0')}`;
}

function build(): DemoProjectRows[] {
  return demoProjects.map((project) => buildDemoProjectRows(project, { startedAt, rate, id: sequentialIds() }));
}

describe('demo rows', () => {
  it('builds every demo project into rows that follow the recorded schemas', () => {
    for (const rows of build()) {
      expect(rows.turns.length).toBeGreaterThan(0);
      for (const turn of rows.turns) {
        if (turn.configuration) turnConfigurationSchema.parse(turn.configuration);
        if (turn.memorySnapshot) memoryStateSchema.parse(turn.memorySnapshot);
        if (turn.memoryResult) memoryResultSchema.parse(turn.memoryResult);
        if (turn.direction) turnDirectionSchema.parse(turn.direction);
        if (turn.developments) attributedDevelopmentSchema.array().parse(turn.developments);
      }
      for (const run of rows.memoryRuns) memoryResultSchema.parse(run.result);
    }
  });

  it('is deterministic for a given clock and identifier source', () => {
    expect(build()).toEqual(build());
  });

  it('covers the cases a PR is tested on', () => {
    const turns = build().flatMap((rows) => rows.turns);
    const calls = build().flatMap((rows) => rows.llmCalls);
    const directionCalls = (turnId: string) => calls.filter((call) => call.turnId === turnId && call.stage === 'direction');

    expect(turns.some((turn) => turn.configuration === null && turn.developments === null)).toBe(true);
    expect(turns.some((turn) => turn.status === 'failed')).toBe(true);
    expect(turns.some((turn) => turn.direction && turn.direction.nudges.length > 0)).toBe(true);
    // A failed direction: the Director was called, nothing was recorded, every development happened.
    const failedDirection = turns.find((turn) => !turn.direction && turn.id && directionCalls(turn.id).length > 0);
    expect(failedDirection && directionCalls(failedDirection.id).every((call) => call.status === 'error')).toBe(true);
    expect(failedDirection?.developments?.some((development) => development.item.scope === 'offscreen')).toBe(true);
    const developments = turns.flatMap((turn) => turn.developments ?? []);
    expect(developments.some((development) => development.item.scope === 'scene')).toBe(true);
    expect(developments.some((development) => development.item.scope === 'offscreen')).toBe(true);
    expect(turns.some((turn) => turn.memoryResult?.changes.some((change) => change.op === 'edit'))).toBe(true);
  });

  it('records developments only when the Director retained them', () => {
    for (const turn of build().flatMap((rows) => rows.turns)) {
      if (!turn.direction) continue;
      const dismissed = turn.direction.dismissed.map((selection) => selection.item.text);
      expect(turn.developments?.some((development) => dismissed.includes(development.item.text))).toBe(false);
    }
  });

  it('keeps a chronology the application can produce', () => {
    for (const rows of build()) {
      const byId = new Map(rows.turns.map((turn) => [turn.id, turn]));
      for (const turn of rows.turns) {
        const calls = rows.llmCalls.filter((call) => call.turnId === turn.id);
        expect(calls.every((call) => call.createdAt && turn.completedAt && call.createdAt <= turn.completedAt)).toBe(true);
        const parent = turn.parentTurnId ? byId.get(turn.parentTurnId) : undefined;
        if (parent?.completedAt && turn.createdAt) expect(turn.createdAt > parent.completedAt).toBe(true);
        if (!turn.regeneratedFromTurnId || !turn.createdAt) continue;
        // A regeneration targets a branch head: nothing was built on its source before it.
        const regeneratedAt = turn.createdAt;
        expect(rows.turns.some((other) => other.parentTurnId === turn.regeneratedFromTurnId
          && other.createdAt !== undefined && other.createdAt < regeneratedAt)).toBe(false);
        const branch = rows.branches.find((candidate) => candidate.id === turn.originBranchId);
        expect(branch?.createdAt).toEqual(turn.createdAt);
      }
    }
  });

  it('prices calls with the given rate and leaves them unpriced without one', () => {
    const priced = build().flatMap((rows) => rows.llmUsages);
    expect(priced.filter((usage) => usage.status === 'success').every((usage) => usage.pricingId === rate.id)).toBe(true);
    const unpriced = buildDemoProjectRows(demoProjects[0]!, { startedAt, rate: null, id: sequentialIds() }).llmUsages;
    expect(unpriced.every((usage) => usage.costBasis === 'unpriced' && usage.costMicroUsd === null)).toBe(true);
  });
});
