export const turnDrawerTabs = [
  { value: 'overview', label: 'Synthèse' },
  { value: 'context', label: 'Contexte' },
  { value: 'cost', label: 'Coût et durée' },
  { value: 'configuration', label: 'Configuration' },
  { value: 'memory', label: 'Mémoire' },
  { value: 'story', label: 'Récit' },
  { value: 'calls', label: 'Appels bruts' },
] as const;

export type TurnDrawerTab = (typeof turnDrawerTabs)[number]['value'];

export function isTurnDrawerTab(value: string | null): value is TurnDrawerTab {
  return turnDrawerTabs.some((tab) => tab.value === value);
}
