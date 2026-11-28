import type { NudgeType, TensionTarget } from '@choral-writer/shared';

/** Fixed meaning of the direction vocabulary, shared by the Director's contract and the Narrator's rules. */
export const tensionLabels: Record<TensionTarget, string> = {
  monter: 'faire monter la tension',
  tenir: 'maintenir la tension',
  relacher: 'relâcher la tension',
  basculer: 'faire basculer la scène',
};

export const nudgeDescriptions: Record<NudgeType, string> = {
  saillance: 'rendre un élément plus visible',
  retard: 'laisser une question ouverte, de façon réversible',
  pression: 'mettre au premier plan l’intention d’un PNJ',
  complication: 'contrarier l’issue d’une tentative du protagoniste, jamais l’acte lui-même',
  relance: 'donner prise au joueur après une stagnation',
};
