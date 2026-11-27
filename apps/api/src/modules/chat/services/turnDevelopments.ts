import type { AnalysisEnvelope, AttributedDevelopment, TurnDirection } from '@choral-writer/shared';
import { contributionsLetThrough, isDevelopment } from '@choral-writer/shared';

/**
 * What happens in the story world during the turn: every development the direction lets through, off-screen
 * ones included. A development the Director dismissed does not happen.
 */
export function turnDevelopments(
  whiteboard: readonly AnalysisEnvelope[], direction: TurnDirection | null,
): AttributedDevelopment[] {
  return contributionsLetThrough(whiteboard, direction)
    .flatMap(({ agent, item }) => isDevelopment(item) ? [{ agent, item }] : []);
}
