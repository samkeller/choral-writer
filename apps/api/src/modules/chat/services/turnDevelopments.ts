import type { AnalysisEnvelope, AttributedDevelopment, AttributedItem, TurnDirection } from '@choral-writer/shared';
import { isDevelopment } from '@choral-writer/shared';

/**
 * What happens in the story world during the turn. A development the Director dismissed does not
 * happen; without a direction (none configured, or a failed one), every development does.
 */
export function turnDevelopments(
  whiteboard: readonly AnalysisEnvelope[], direction: TurnDirection | null,
): AttributedDevelopment[] {
  const contributions: AttributedItem[] = direction
    ? direction.retained
    : whiteboard.flatMap((envelope) => envelope.items.map((item) => ({ agent: envelope.agent, item })));
  return contributions.flatMap(({ agent, item }) => isDevelopment(item) ? [{ agent, item }] : []);
}
