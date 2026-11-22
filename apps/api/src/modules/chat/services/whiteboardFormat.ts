import type { AnalysisItem } from '@choral-writer/shared';

const importanceLabels: Record<AnalysisItem['importance'], string> = {
  LOW: 'faible', NORMAL: 'normale', HIGH: 'haute',
};

/** One whiteboard item as the Director and the Narrator read it. */
export function formatItem(item: AnalysisItem): string {
  return `${item.kind} (importance ${importanceLabels[item.importance]}) : ${item.text}`;
}
