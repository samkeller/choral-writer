import { afterEach, describe, expect, it, vi } from 'vitest';

import { initialPipelineProgress, updatePipelineProgress } from './chatPipelineProgress';

describe('chat pipeline progress', () => {
  afterEach(() => vi.restoreAllMocks());

  it('updates the active stage and ignores events for another turn', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1200);
    const initial = initialPipelineProgress('turn-1');
    const started = updatePipelineProgress(initial, {
      type: 'chat.pipeline.stage',
      turnId: 'turn-1',
      stage: 'analysis',
      status: 'started',
      agentCount: 2,
    });

    expect(started).toMatchObject({
      activeStage: 'analysis',
      activeStageStartedAt: 1200,
      analysis: { status: 'running', agentCount: 2 },
    });
    expect(updatePipelineProgress(started, {
      type: 'chat.pipeline.stage',
      turnId: 'turn-2',
      stage: 'narrator',
      status: 'started',
    })).toBe(started);
  });

  it('preserves an agent start time when its completion arrives', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1200);
    const initial = initialPipelineProgress('turn-1');
    const started = updatePipelineProgress(initial, {
      type: 'chat.pipeline.agent',
      turnId: 'turn-1',
      agentId: 'agent-1',
      name: 'Researcher',
      status: 'started',
    });

    const completed = updatePipelineProgress(started, {
      type: 'chat.pipeline.agent',
      turnId: 'turn-1',
      agentId: 'agent-1',
      name: 'Researcher',
      status: 'completed',
      durationMs: 450,
    });

    expect(completed?.analysis.agents['agent-1']).toEqual({
      name: 'Researcher',
      status: 'completed',
      startedAt: 1200,
      durationMs: 450,
    });
  });
});
