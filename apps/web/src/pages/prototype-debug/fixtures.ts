// PROTOTYPE — « Prototype : forme du mode Debug ». Données fictives et neutres, générées par index de tour.
// Aucun contenu de récit : les lignes de synthèse sont des gabarits génériques.

export type Verdict = 'retenu' | 'partiel' | 'ignoré';
export type Phase = 'Analyse' | 'Direction' | 'Narrateur' | 'Gardien' | 'Mémoire';
export type ContextPart = 'Prompt du projet' | 'Instructions' | 'Whiteboard' | 'Mémoire' | 'Historique' | 'Développements' | 'Saisie';
export type ChangeKind = 'added' | 'removed' | 'changed';
export type NudgeType = 'saillance' | 'retard' | 'interdit' | 'pression' | 'événement' | 'complication' | 'relance';

export const contextParts: ContextPart[] = ['Prompt du projet', 'Instructions', 'Whiteboard', 'Mémoire', 'Historique', 'Développements', 'Saisie'];
// Phases : charte de phasePresentation (Analyse bleu, Restitution violet), étendue aux phases V2.
// Nuance 7 : assez saturée pour distinguer, assez sombre pour ne pas crier sur fond sombre.
export const phaseColor: Record<Phase, string> = {
  Analyse: 'blue.7', Direction: 'indigo.7', Narrateur: 'violet.7', Gardien: 'teal.7', Mémoire: 'teal.9',
};
// Parties du contexte : l'historique, principal suspect de la dérive, en couleur chaude ; le reste en tons froids.
export const partColor: Record<ContextPart, string> = {
  'Prompt du projet': 'violet.8', Instructions: 'indigo.7', Whiteboard: 'blue.7', Mémoire: 'teal.7',
  Historique: 'orange.7', Développements: 'cyan.8', Saisie: 'lime.8',
};
export const verdictColor: Record<Verdict, string> = { retenu: 'green', partiel: 'yellow', ignoré: 'gray' };
export const changeColor: Record<ChangeKind, string> = { added: 'green', removed: 'red', changed: 'blue' };

export interface Call {
  label: string;
  phase: Phase;
  model: string;
  durationMs: number;
  costUsd: number;
  input: Partial<Record<ContextPart, number>>;
  outputTokens: number;
}

export interface Attribution {
  agent: string;
  proposal: string;
  verdict: Verdict;
  why: string;
}

export type ItemKind = 'développement' | 'suggestion' | 'alerte';

/** Parcours d'un item d'analyse : produit par un agent, transmis ou écarté par le Directeur, puis repris ou non dans la prose. */
export interface AnalysisItem {
  kind: ItemKind;
  text: string;
  scope: 'scene' | 'offscreen';
  transmitted: boolean;
  discardReason?: string;
  prose?: Verdict;
}

export interface AgentOutput {
  agent: string;
  durationMs: number;
  items: AnalysisItem[];
}

export interface Nudge {
  type: NudgeType;
  basis: string;
}

export interface ConfigChange {
  kind: ChangeKind;
  label: string;
}

export interface DebugTurn {
  index: number;
  durationMs: number;
  costUsd: number;
  whatHappened: string;
  attribution: Attribution[];
  calls: Call[];
  analysis: AgentOutput[];
  direction: { tension: { target: number; previous: number }; nudges: Nudge[] } | null;
  thwarted: boolean;
  configChanges: ConfigChange[];
}

const agents = ['Cohérence', 'Personnages', 'Monde', 'Rythme'];
const happenings = [
  'Le protagoniste obtient une information, mais à un prix ; un tiers agit hors champ.',
  'La scène se déplace ; un personnage secondaire refuse d’aider et prend l’initiative.',
  'Une tentative du protagoniste échoue en partie ; une complication arrive de l’extérieur.',
  'Temps calme : dialogue, un indice planté pour plus tard.',
  'Un développement hors champ rattrape la scène ; la tension monte d’un cran.',
];
const proposals: Record<string, string[]> = {
  Cohérence: ['Rappeler la blessure du tour 2', 'Signaler une contradiction de lieu', 'Rien à signaler'],
  Personnages: ['B. refuse et part de son côté', 'C. ment pour protéger son intention', 'A. hésite puis cède'],
  Monde: ['Une patrouille change d’itinéraire (hors champ)', 'La météo se dégrade', 'Une rumeur circule (hors champ)'],
  Rythme: ['Couper la scène plus tôt', 'Ralentir : laisser respirer', 'Accélérer vers la confrontation'],
};
const reasons = ['redondant avec un autre agent', 'contredit un acte du protagoniste', 'trop tôt dans l’arc', 'hors sujet pour cette scène'];
const nudgeTypes: NudgeType[] = ['saillance', 'retard', 'pression', 'complication', 'relance', 'événement', 'interdit'];
const models = { small: 'haiku', large: 'sonnet' };

function rand(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function pick<T>(list: T[], seed: number): T {
  return list[Math.floor(rand(seed) * list.length)];
}

export function buildTurn(index: number): DebugTurn {
  const history = Math.round(200 + index * 1150 + rand(index) * 300);
  const memory = Math.round(300 + index * 90);
  const whiteboard = Math.round(400 + rand(index + 3) * 500);
  const activeAgents = index >= 3 ? agents : agents.slice(0, 3);

  const analysisCalls: Call[] = activeAgents.map((agent, a) => ({
    label: agent, phase: 'Analyse', model: models.small,
    durationMs: 3000 + rand(index * 7 + a) * 5000,
    costUsd: 0.002 + rand(index * 11 + a) * 0.003,
    input: { 'Prompt du projet': 650, Instructions: 300 + a * 40, Mémoire: memory, Historique: Math.round(history * 0.6), Saisie: 60 },
    outputTokens: 180 + Math.round(rand(a + index) * 200),
  }));
  const calls: Call[] = [
    ...analysisCalls,
    { label: 'Directeur', phase: 'Direction', model: models.small, durationMs: 4200, costUsd: 0.004,
      input: { 'Prompt du projet': 650, Instructions: 520, Whiteboard: whiteboard, Saisie: 60 }, outputTokens: 260 },
    { label: 'Narrateur', phase: 'Narrateur', model: models.large, durationMs: 18000 + rand(index) * 12000, costUsd: 0.018 + index * 0.003,
      input: { 'Prompt du projet': 650, Instructions: 420, Whiteboard: Math.round(whiteboard * 0.7), Mémoire: memory, Historique: history, Développements: 180, Saisie: 60 },
      outputTokens: 1100 + Math.round(rand(index + 1) * 1600) },
    { label: 'Gardien', phase: 'Gardien', model: models.small, durationMs: 6000, costUsd: 0.005,
      input: { Instructions: 380, Mémoire: memory, Développements: 320, Saisie: 60, Historique: 1800 }, outputTokens: 300 },
    { label: 'Réducteur', phase: 'Mémoire', model: models.small, durationMs: 2500, costUsd: 0.001,
      input: { Instructions: 200, Mémoire: memory }, outputTokens: 120 },
  ];

  const attribution: Attribution[] = activeAgents.map((agent, a) => {
    const verdict = pick<Verdict>(['retenu', 'retenu', 'partiel', 'ignoré'], index * 5 + a);
    return {
      agent, proposal: pick(proposals[agent], index + a), verdict,
      why: verdict === 'retenu' ? 'visible au 2ᵉ paragraphe' : verdict === 'partiel' ? 'évoqué, sans conséquence' : 'absent de la prose',
    };
  });

  const kinds: ItemKind[] = ['développement', 'suggestion', 'suggestion', 'alerte'];
  const analysis: AgentOutput[] = activeAgents.map((agent, a) => ({
    agent,
    durationMs: analysisCalls[a].durationMs,
    items: proposals[agent].slice(0, 2 + Math.floor(rand(index * 13 + a) * 2)).map((text, i) => {
      const seed = index * 31 + a * 7 + i;
      const scope = agent === 'Monde' && i !== 1 ? 'offscreen' : 'scene';
      const transmitted = index === 6 || rand(seed) > 0.3;
      return {
        kind: agent === 'Cohérence' ? 'alerte' : agent === 'Monde' ? 'développement' : kinds[(seed) % kinds.length],
        text, scope, transmitted,
        discardReason: transmitted ? undefined : pick(reasons, seed),
        prose: transmitted && scope === 'scene' ? pick<Verdict>(['retenu', 'retenu', 'partiel', 'ignoré'], seed + 1) : undefined,
      } satisfies AnalysisItem;
    }),
  }));
  const nudgeCount = Math.floor(rand(index + 9) * 3);
  const previous = Math.min(5, 1 + Math.floor(index / 2));

  const configChanges: ConfigChange[] = index === 3
    ? [{ kind: 'added', label: 'Rythme v1' }]
    : index === 5
      ? [{ kind: 'changed', label: 'Personnages v3 → v4' }, { kind: 'changed', label: 'Prompt du projet modifié' }]
      : index === 6 ? [{ kind: 'removed', label: 'Directeur désactivé' }] : [];
  const directed = index !== 6;

  return {
    index,
    durationMs: calls.filter((call) => call.phase !== 'Analyse').reduce((sum, call) => sum + call.durationMs, 0)
      + Math.max(...analysisCalls.map((call) => call.durationMs)),
    costUsd: calls.reduce((sum, call) => sum + call.costUsd, 0),
    whatHappened: pick(happenings, index),
    attribution,
    calls: directed ? calls : calls.filter((call) => call.phase !== 'Direction'),
    analysis,
    direction: directed ? {
      tension: { previous, target: Math.min(5, previous + (rand(index + 2) > 0.4 ? 1 : 0)) },
      nudges: Array.from({ length: nudgeCount }, (_, n) => ({
        type: nudgeTypes[(index + n * 2) % nudgeTypes.length],
        basis: pick(['Intention de B. bloquée depuis 2 tours', 'tension stable depuis 3 tours', 'développement hors champ en attente', 'fil laissé ouvert au tour 1'], index + n),
      })),
    } : null,
    thwarted: rand(index + 17) > 0.6,
    configChanges,
  };
}

export const tensionLevels = ['', 'calme', 'frémissement', 'montée', 'crise', 'paroxysme'];

export const totalInput = (call: Call) => Object.values(call.input).reduce((sum, value) => sum + (value ?? 0), 0);
export const usd = (value: number) => `${value.toFixed(3).replace('.', ',')} $`;
export const seconds = (ms: number) => `${(ms / 1000).toFixed(0)} s`;
export const tokens = (value: number) => value >= 1000 ? `${(value / 1000).toFixed(1).replace('.', ',')} k` : `${value}`;

export function costByPhase(turn: DebugTurn) {
  const result = new Map<Phase, number>();
  for (const call of turn.calls) result.set(call.phase, (result.get(call.phase) ?? 0) + call.costUsd);
  return [...result.entries()].map(([phase, cost]) => ({ phase, cost }));
}

export function storyRates(turns: DebugTurn[]) {
  const directed = turns.filter((turn) => turn.direction);
  return {
    nudgeRate: directed.filter((turn) => turn.direction!.nudges.length > 0).length / Math.max(1, directed.length),
    thwartedRate: turns.filter((turn) => turn.thwarted).length / Math.max(1, turns.length),
    totalCost: turns.reduce((sum, turn) => sum + turn.costUsd, 0),
  };
}
