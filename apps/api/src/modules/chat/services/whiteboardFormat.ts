import type { AnalysisItem, DevelopmentScope } from '@choral-writer/shared';
import { isDevelopment } from '@choral-writer/shared';

const importanceLabels: Record<AnalysisItem['importance'], string> = {
  LOW: 'faible', NORMAL: 'normale', HIGH: 'haute',
};

const scopeLabels: Record<DevelopmentScope, string> = {
  scene: 'dans la scène',
  offscreen: 'hors champ',
};

/** One whiteboard item as the Director and the Narrator read it. */
export function formatItem(item: AnalysisItem): string {
  const importance = `importance ${importanceLabels[item.importance]}`;
  if (!isDevelopment(item)) return `${item.kind} (${importance}) : ${item.text}`;
  const characters = item.characters.length ? `personnages : ${item.characters.join(', ')} ; ` : '';
  return `développement ${scopeLabels[item.scope]} (${characters}${importance}) : ${item.text}`;
}
