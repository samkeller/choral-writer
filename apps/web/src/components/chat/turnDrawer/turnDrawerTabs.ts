import type { TurnTraceSummary } from '@choral-writer/shared';

export const turnDrawerTabs = [
  { value: 'overview', label: 'Synthèse' },
  { value: 'analysis', label: 'Analyse' },
  { value: 'context', label: 'Contexte' },
  { value: 'cost', label: 'Coût et durée' },
  { value: 'direction', label: 'Direction' },
  { value: 'configuration', label: 'Configuration' },
  { value: 'memory', label: 'Mémoire' },
  { value: 'story', label: 'Récit' },
  { value: 'calls', label: 'Appels bruts' },
] as const;

export type TurnDrawerTab = (typeof turnDrawerTabs)[number]['value'];

export function isTurnDrawerTab(value: string | null): value is TurnDrawerTab {
  return turnDrawerTabs.some((tab) => tab.value === value);
}

/** Analyse needs an analysis agent and Direction a Director, which a turn still loading is not known to have. */
export function tabApplies(tab: TurnDrawerTab, summary: TurnTraceSummary | null): boolean {
  if (tab === 'analysis') return Boolean(summary && summary.analysis.length > 0);
  if (tab === 'direction') return Boolean(summary?.direction);
  return true;
}
