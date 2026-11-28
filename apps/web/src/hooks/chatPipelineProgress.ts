import type { ChatEvent } from '@choral-writer/shared';

type PipelineStage = 'analysis' | 'direction' | 'narrator' | 'guardian' | 'reducer';
type PipelineStepStatus = 'pending' | 'running' | 'completed' | 'failed';

export type ChatPipelineProgress = {
  turnId: string;
  memoryOnly?: boolean;
  activeStage: PipelineStage | null;
  activeStageStartedAt: number | null;
  analysis: {
    status: PipelineStepStatus;
    elapsedMs: number;
    agentCount: number;
    agents: Record<string, {
      name: string;
      status: 'started' | 'completed' | 'failed';
      startedAt: number | null;
      durationMs: number | null;
    }>;
  };
  /** Stays pending when the project has no Director. */
  direction: { status: PipelineStepStatus; elapsedMs: number };
  narrator: { status: PipelineStepStatus; elapsedMs: number };
  guardian: { status: PipelineStepStatus; elapsedMs: number };
  reducer: { status: PipelineStepStatus; elapsedMs: number };
};

export function initialPipelineProgress(turnId: string): ChatPipelineProgress {
  return {
    turnId,
    activeStage: null,
    activeStageStartedAt: null,
    analysis: { status: 'pending', elapsedMs: 0, agentCount: 0, agents: {} },
    direction: { status: 'pending', elapsedMs: 0 },
    narrator: { status: 'pending', elapsedMs: 0 },
    guardian: { status: 'pending', elapsedMs: 0 },
    reducer: { status: 'pending', elapsedMs: 0 },
  };
}

export function updatePipelineProgress(
  current: ChatPipelineProgress | null,
  event: ChatEvent,
): ChatPipelineProgress | null {
  switch (event.type) {
    case 'chat.pipeline.stage': {
      if (!current || current.turnId !== event.turnId) return current;
      if (event.status === 'started') {
        return {
          ...current,
          activeStage: event.stage,
          activeStageStartedAt: Date.now(),
          [event.stage]: {
            ...current[event.stage],
            status: 'running',
            ...(event.stage === 'analysis' ? { agentCount: event.agentCount ?? 0 } : {}),
          },
        };
      }

      return {
        ...current,
        activeStage: current.activeStage === event.stage ? null : current.activeStage,
        activeStageStartedAt: current.activeStage === event.stage ? null : current.activeStageStartedAt,
        [event.stage]: {
          ...current[event.stage],
          status: event.status,
          elapsedMs: event.elapsedMs ?? current[event.stage].elapsedMs,
        },
      };
    }
    case 'chat.pipeline.agent': {
      if (!current || current.turnId !== event.turnId) return current;
      const previous = current.analysis.agents[event.agentId];
      return {
        ...current,
        analysis: {
          ...current.analysis,
          agents: {
            ...current.analysis.agents,
            [event.agentId]: {
              name: event.name,
              status: event.status,
              startedAt: event.status === 'started' ? Date.now() : previous?.startedAt ?? null,
              durationMs: event.durationMs ?? previous?.durationMs ?? null,
            },
          },
        },
      };
    }
    default:
      return current;
  }
}
