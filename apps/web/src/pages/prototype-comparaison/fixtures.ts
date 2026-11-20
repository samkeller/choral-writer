// PROTOTYPE — données fictives et neutres. Aucun contenu de récit réel : le dépôt est public.

export type ConfigChange = 'same' | 'added' | 'removed' | 'changed';
export type Verdict = 'retenu' | 'partiel' | 'ignoré';

export interface AgentLine {
  name: string;
  version: string;
  change: ConfigChange;
  /** Ce que l'agent proposait dans le whiteboard (résumé d'attribution). */
  proposal: string | null;
  verdict: Verdict | null;
  whiteboard: string | null;
  costUsd: number;
}

export interface TurnVersion {
  label: string;
  branchName: string;
  summary: string;
  agents: AgentLine[];
  narrator: { version: string; change: ConfigChange; costUsd: number };
  memoryCostUsd: number;
  durationS: number;
  words: number;
  memoryChanges: string[];
  prose: string[];
}

export const userInput = 'Le joueur demande au marchand d’où vient la carte.';

const filler = 'Texte fictif de démonstration. La prose complète du tour apparaîtrait ici, sur plusieurs paragraphes, sans rien révéler du récit réel.';

export const original: TurnVersion = {
  label: 'Original',
  branchName: 'Principale',
  summary: 'Le marchand élude la question et change de sujet ; la scène reste au marché, rien ne bouge.',
  agents: [
    { name: 'Marchand', version: 'v2', change: 'same', proposal: 'Mentir sur l’origine de la carte', verdict: 'partiel', whiteboard: 'Il cache que la carte est volée. Il ment, maladroitement.', costUsd: 0.004 },
    { name: 'Cohérence', version: 'v1', change: 'same', proposal: 'Rappeler que la carte porte un sceau', verdict: 'ignoré', whiteboard: 'Le sceau a été décrit au tour 3.', costUsd: 0.003 },
    { name: 'Hors champ', version: 'v1', change: 'same', proposal: 'La garde fouille le quartier', verdict: 'ignoré', whiteboard: 'La garde cherche un objet volé à deux rues.', costUsd: 0.005 },
  ],
  narrator: { version: 'v3', change: 'same', costUsd: 0.021 },
  memoryCostUsd: 0.006,
  durationS: 38.2,
  words: 1180,
  memoryChanges: ['+ Le marchand évite le sujet de la carte'],
  prose: [filler, filler, filler],
};

export const variant: TurnVersion = {
  label: 'Variante',
  branchName: 'Alternative 2',
  summary: 'Le marchand ment ; la garde surgit au bout de la rue et le marchand presse le joueur de partir.',
  agents: [
    { name: 'Marchand', version: 'v2', change: 'same', proposal: 'Mentir sur l’origine de la carte', verdict: 'retenu', whiteboard: 'Il cache que la carte est volée. Il ment, maladroitement.', costUsd: 0.004 },
    { name: 'Cohérence', version: 'v1', change: 'same', proposal: 'Rappeler que la carte porte un sceau', verdict: 'ignoré', whiteboard: 'Le sceau a été décrit au tour 3.', costUsd: 0.003 },
    { name: 'Hors champ', version: 'v1', change: 'same', proposal: 'La garde fouille le quartier', verdict: 'retenu', whiteboard: 'La garde cherche un objet volé à deux rues.', costUsd: 0.005 },
    { name: 'Agent du chaos', version: 'v1', change: 'added', proposal: 'Faire arriver la garde maintenant', verdict: 'retenu', whiteboard: 'Interrompre la scène : la garde arrive.', costUsd: 0.004 },
  ],
  narrator: { version: 'v4', change: 'changed', costUsd: 0.024 },
  memoryCostUsd: 0.007,
  durationS: 44.9,
  words: 1310,
  memoryChanges: ['+ La garde a vu le joueur avec le marchand', '+ Le marchand a menti sur la carte'],
  prose: [filler, filler, filler],
};

export const totalCost = (version: TurnVersion) =>
  version.agents.reduce((sum, agent) => sum + agent.costUsd, 0) + version.narrator.costUsd + version.memoryCostUsd;

export const usd = (value: number) => `${value.toFixed(3)} $`;

export const configDiff = (base: TurnVersion, other: TurnVersion): string[] => {
  const diff: string[] = [];
  for (const agent of other.agents) {
    const before = base.agents.find((a) => a.name === agent.name);
    if (!before) diff.push(`+ ${agent.name} ${agent.version}`);
    else if (before.version !== agent.version) diff.push(`~ ${agent.name} ${before.version} → ${agent.version}`);
  }
  for (const agent of base.agents) if (!other.agents.some((a) => a.name === agent.name)) diff.push(`− ${agent.name}`);
  if (base.narrator.version !== other.narrator.version) diff.push(`~ Narrateur ${base.narrator.version} → ${other.narrator.version}`);
  return diff;
};
