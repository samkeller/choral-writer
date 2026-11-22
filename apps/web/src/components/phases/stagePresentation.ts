import type { traceStageSchema } from '@choral-writer/shared';

import { phasePresentation } from './phasePresentation';

type TraceStage = (typeof traceStageSchema.options)[number];

/**
 * Pipeline stages, in execution order, with the phase palette extended to V2 stages.
 * Shade 7 keeps stages distinct on a dark background without shouting.
 */
export const stagePresentation = {
  analysis: { label: 'Analyse', color: `${phasePresentation.analysis.color}.7` },
  direction: { label: 'Direction', color: `${phasePresentation.direction.color}.7` },
  narrator: { label: 'Narrateur', color: `${phasePresentation.restitution.color}.7` },
  guardian: { label: 'Gardien', color: 'teal.7' },
  reducer: { label: 'Mémoire', color: 'teal.9' },
} satisfies Record<TraceStage, { label: string; color: string }>;

export const pipelineStages = Object.keys(stagePresentation) as TraceStage[];

/** Presentation of a recorded stage, including stages this client does not know yet. */
export function stagePresentationOf(stage: string): { label: string; color: string } {
  return Object.hasOwn(stagePresentation, stage)
    ? stagePresentation[stage as TraceStage]
    : { label: stage, color: 'gray.7' };
}
