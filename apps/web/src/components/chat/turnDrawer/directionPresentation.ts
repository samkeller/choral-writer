import type { NudgeType, TensionTarget } from '@choral-writer/shared';

import { type TensionLevels, tensionScale } from './directionInsights';

/** What a Director does to the tension, as a verb phrase. */
export const tensionMoves = {
  monter: 'fait monter la tension',
  tenir: 'maintient la tension',
  relacher: 'relâche la tension',
  basculer: 'fait basculer la scène',
} satisfies Record<TensionTarget, string>;

/** Which way the pressure of a nudge pushes the telling of a turn. */
export const nudgeDescriptions = {
  saillance: 'rendre un élément plus visible',
  retard: 'laisser une question ouverte',
  pression: 'mettre au premier plan l’intention d’un personnage',
  complication: 'contrarier l’issue d’une tentative du protagoniste',
  relance: 'donner prise au joueur après une stagnation',
} satisfies Record<NudgeType, string>;

/** The tension move in a sentence, placed on the named scale when the story levels are known. */
export function describeTensionMove(target: TensionTarget, levels: TensionLevels | null): string {
  const move = `Le Directeur ${tensionMoves[target]}`;
  if (!levels) return `${move}.`;
  const from = tensionScale[levels.previous];
  const to = tensionScale[levels.current];
  switch (target) {
    case 'monter':
      return levels.current > levels.previous ? `${move} d’un cran : de ${from} à ${to}.` : `${move}, déjà au plus haut : ${to}.`;
    case 'relacher':
      return levels.current < levels.previous ? `${move} d’un cran : de ${from} à ${to}.` : `${move}, déjà au plus bas : ${to}.`;
    case 'tenir':
      return `${move} : ${to}.`;
    case 'basculer':
      return `${move}, sans changer le niveau estimé : ${to}.`;
  }
}
