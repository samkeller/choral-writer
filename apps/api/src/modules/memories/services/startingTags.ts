import type { MemoryTag } from '@choral-writer/shared';

type StartingTag = Omit<MemoryTag, 'id'>;

/**
 * Tags every project starts with. They split memory by kind of content, which every story shares,
 * so that routing can be proposed from the first turn. Descriptions are the Guardian's reading contracts.
 */
export const STARTING_TAGS: readonly StartingTag[] = [
  {
    name: 'Faits',
    description: 'Événements établis du récit, dans la scène ou hors champ : ce qui s’est passé, qui l’a fait, où et quand, et ce qui en découle durablement. Ni les croyances d’un personnage, ni les règles générales du monde.',
  },
  {
    name: 'Monde',
    description: 'Règles et éléments durables de l’univers : lieux, institutions, techniques, ressources et contraintes. Ce qui reste vrai d’une scène à l’autre, indépendamment des personnages.',
  },
  {
    name: 'Intentions',
    description: 'Une entrée par personnage qui compte, de clé « personnage/<nom> » : son objectif, son plan en cours, sa situation et ses relations utiles, en quelques lignes. Ce que le personnage poursuit et croit, pas ce qui est établi dans le monde.',
  },
  {
    name: 'Fils ouverts',
    description: 'Questions, menaces et promesses que le récit a posées sans les résoudre : un danger en suspens, un secret non révélé, un engagement à tenir. Une entrée est archivée une fois le fil résolu.',
  },
];

export function startingTags(newId: () => string): MemoryTag[] {
  return STARTING_TAGS.map((tag) => ({ id: newId(), ...tag }));
}
