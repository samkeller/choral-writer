import type { NudgeType, TensionTarget } from '@choral-writer/shared';

import { type TensionLevels, tensionScale } from './directionInsights';

/** The tension move the Director decided, in one word: the actual data, unlike the estimated level. */
export const tensionMoveLabels = {
  monter: 'monte',
  tenir: 'tient',
  relacher: 'relâche',
  basculer: 'bascule',
} satisfies Record<TensionTarget, string>;

/** The tension move the Director decided, in a sentence. */
export const tensionMoveSentences = {
  monter: 'Le Directeur fait monter la tension.',
  tenir: 'Le Directeur maintient la tension.',
  relacher: 'Le Directeur relâche la tension.',
  basculer: 'Le Directeur fait basculer la scène.',
} satisfies Record<TensionTarget, string>;

/** Shown wherever an estimated level appears, so that it never reads as a decision of the Director. */
export const TENSION_ESTIMATE_HINT =
  'Niveau estimé : il cumule les mouvements du Directeur depuis le début du récit, en partant de « calme ».';

/** Which way the pressure of a nudge pushes the telling of a turn. */
export const nudgeDescriptions = {
  saillance: 'rendre un élément plus visible',
  retard: 'laisser une question ouverte',
  pression: 'mettre au premier plan l’intention d’un personnage',
  complication: 'contrarier l’issue d’une tentative du protagoniste',
  relance: 'donner prise au joueur après une stagnation',
} satisfies Record<NudgeType, string>;

/** The estimated level of a turn, told as an estimate; a move that hits an end of the scale leaves it unchanged. */
export function describeEstimatedLevel(target: TensionTarget, levels: TensionLevels): string {
  const from = tensionScale[levels.previous];
  const to = tensionScale[levels.current];
  if (levels.current !== levels.previous) return `Niveau estimé : de ${from} à ${to}.`;
  const bounded = target === 'monter' || target === 'relacher';
  return `Niveau estimé : ${to}, inchangé${bounded ? ' (borne de l’échelle)' : ''}.`;
}
