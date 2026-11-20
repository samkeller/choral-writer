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

// Prose fictive et neutre, écrite pour le prototype : elle n'a qu'à occuper la place d'un vrai tour.
const proseOriginal = [
  'Le marchand repose la carte sur l’étal, la lisse du plat de la main, comme s’il voulait en effacer les plis. Il sourit sans regarder le joueur et désigne d’un geste vague les rouleaux de tissu empilés derrière lui.',
  '« D’où elle vient ? D’un vieux fonds de boutique, comme tout le reste. » Il enchaîne aussitôt sur le prix des étoffes, la saison des pluies qui approche, la rareté des teintures bleues cette année.',
  'Autour d’eux, le marché suit son cours. Une marchande de fruits appelle les passants, deux enfants se disputent une pièce tombée entre les pavés, et l’odeur du pain chaud monte d’une échoppe voisine.',
  'Le marchand finit par replier la carte et la glisser sous une pile de tissus. « Si elle vous intéresse, revenez demain. J’aurai peut-être retrouvé le carnet où je note mes achats. »',
  'Le soleil décline lentement sur les toits. Rien ne presse ; la journée s’achève comme elle a commencé, dans le bruit tranquille des marchandages.',
];
const proseVariant = [
  'Le marchand repose la carte sur l’étal un peu trop vite. « Un vieux fonds de boutique », dit-il, et sa voix monte d’un ton sur le dernier mot. Ses doigts tapotent le bois, nerveux.',
  'Au bout de la rue, des éclats de voix interrompent les marchandages. Trois gardes en manteau gris avancent d’étal en étal, soulèvent les bâches, ouvrent les coffres sans demander la permission.',
  'Le marchand les a vus aussi. Il plie la carte en quatre d’un geste sec et la pousse vers le joueur. « Gardez-la. Vous ne l’avez pas eue ici. Partez par la ruelle des tanneurs, maintenant. »',
  'Un garde lève la tête, croise un instant le regard du joueur, puis se retourne vers un étal voisin. La foule commence à s’écarter, et le marché tout entier semble retenir son souffle.',
];

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
  prose: proseOriginal,
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
  prose: proseVariant,
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
