import { LIBRARY_AGENTS, type LibraryAgent } from '../modules/agents/repository/agentLibrary.js';

/**
 * Le scénario fictif et anodin de l'évaluation de bout en bout (#43), joué à l'identique par chaque
 * configuration. Il est versionné : le dépôt est public, il ne contient donc que des saisies inventées
 * pour l'occasion, jamais un récit réel.
 */

/** Ce qu'une saisie met à l'épreuve, pour lire les mesures et le jugement tour par tour. */
export type ScenarioProbe = 'ouverture' | 'resistance-monde' | 'resistance-personnage' | 'hors-champ' | 'complication'
  | 'continuite';

export type ScenarioInput = { probe: ScenarioProbe; content: string };

export const SCENARIO_NAME = 'Les vergers de Sainte-Aube';

/** Le seul prompt d'un nouveau projet : le monde, ses règles durables et les Intentions des personnages. */
export const SCENARIO_SYSTEM_PROMPT = [
  'Récit d’aventure tranquille, en français, à la troisième personne et au passé.',
  'La vallée de Sainte-Aube, au début de l’automne, vit de ses vergers, irrigués par un vieux canal de pierre.',
  'Règles du monde : la vallée n’a ni électricité ni réseau téléphonique ; le courrier passe une fois par semaine. Le pont de la Sorgue est fermé dès que la rivière monte. L’écluse du moulin règle l’eau de tout le canal.',
  'Protagoniste : Élise Varenne, jeune cartographe envoyée par le département pour relever le tracé du canal.',
  'Personnages :',
  '- Bastien Morel, le meunier. Il garde la clé de l’écluse et refuse qu’on l’inspecte : il cache une fuite qu’il répare seul depuis l’été, de peur qu’on lui retire la gestion de l’eau.',
  '- Margaux Delpech, la maire. Elle veut une carte qui justifie la vente des parcelles du haut à une coopérative, et presse Élise d’aller vite.',
  '- Ysé Fabre, la garde-rivière. Elle surveille la montée de la Sorgue depuis la source, rarement au village.',
].join('\n');

/**
 * Dix saisies successives : chacune sollicite ce que vise la V2 (résistance aux saisies incohérentes,
 * monde qui vit hors champ, complications) ou la continuité du récit.
 */
export const SCENARIO_INPUTS: readonly ScenarioInput[] = [
  { probe: 'ouverture', content: 'Élise arrive au moulin, se présente à Bastien et lui demande à voir l’écluse pour commencer ses relevés.' },
  { probe: 'hors-champ', content: 'Élise mesure le canal le long des champs du bas pendant tout l’après-midi, sans revenir au village.' },
  { probe: 'resistance-monde', content: 'Élise sort son téléphone et appelle la préfecture pour signaler que le canal fuit près du moulin.' },
  { probe: 'resistance-personnage', content: 'Bastien, enfin convaincu, tend spontanément la clé de l’écluse à Élise et lui avoue tout.' },
  { probe: 'hors-champ', content: 'Élise passe la soirée à l’auberge et recopie ses relevés au propre jusque tard dans la nuit.' },
  { probe: 'complication', content: 'Au matin, Élise prend le chemin du pont de la Sorgue pour rejoindre la source du canal.' },
  { probe: 'complication', content: 'Élise remonte seule le lit du canal jusqu’à la source, en notant chaque vanne sur son carnet.' },
  { probe: 'hors-champ', content: 'Élise reste deux jours à la source pour cartographier les rigoles, loin du village.' },
  { probe: 'continuite', content: 'De retour au moulin, Élise reprend avec Bastien la conversation là où ils l’avaient laissée le premier jour.' },
  { probe: 'continuite', content: 'Élise présente sa carte à Margaux devant le conseil du village et dit ce qu’elle a constaté.' },
];

/** Un agent de la bibliothèque, dans sa dernière version, et les noms des tags de départ qu'il lit, s'il en sélectionne. */
export type ConfiguredAgent = { agentId: string; versionId: string; reads?: readonly string[] };

export type EvaluationConfiguration = {
  key: 'v1' | 'v2';
  label: string;
  /** L'équipe à épingler, ou null pour garder celle d'un nouveau projet (Narrateur et Gardien par défaut). */
  team: readonly ConfiguredAgent[] | null;
  /** Sans mémoire, le Gardien ne tourne pas : c'est le cas d'un nouveau projet sur `main`. */
  memory: boolean;
};

function libraryAgent(name: string, reads?: readonly string[]): ConfiguredAgent {
  const agent: LibraryAgent | undefined = LIBRARY_AGENTS
    .find((candidate) => candidate.versions.some((version) => version.name === name));
  const latest = agent?.versions.reduce((last, version) => version.version > last.version ? version : last);
  if (!agent || !latest) throw new Error(`Library agent "${name}" is missing.`);
  return { agentId: agent.id, versionId: latest.id, ...(reads ? { reads } : {}) };
}

export const EVALUATION_CONFIGURATIONS: readonly EvaluationConfiguration[] = [
  {
    key: 'v1',
    label: 'Type V1 : un nouveau projet comme sur main, Narrateur et Gardien par défaut, mémoire désactivée',
    team: null,
    memory: false,
  },
  {
    key: 'v2',
    label: 'V2 : agents d’analyse de la bibliothèque, Directeur, Narrateur scénique, Gardien des Intentions, mémoire activée',
    memory: true,
    // Sans tags choisis, un agent d'analyse ne lit rien : la répartition est fixée ici, plutôt que proposée par un LLM, pour rester reproductible.
    team: [
      libraryAgent('Continuité', ['Faits', 'Monde']),
      libraryAgent('Personnages et Intentions', ['Intentions', 'Faits']),
      libraryAgent('Hors champ', ['Intentions', 'Fils ouverts']),
      libraryAgent('Dramaturgie', ['Fils ouverts', 'Faits']),
      libraryAgent('Monde et règles', ['Monde']),
      libraryAgent('Directeur mesuré'),
      libraryAgent('Narrateur scénique'),
      libraryAgent('Gardien des Intentions'),
    ],
  },
];
