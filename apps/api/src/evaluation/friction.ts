/**
 * Mesure déterministe de la friction, d'après le code de l'UI et des routes : chaque action d'un parcours
 * s'appuie sur un extrait de code qui la rend nécessaire. Si l'extrait disparaît, l'action est signalée
 * « à revérifier » plutôt que comptée en silence : le parcours a changé et ce relevé doit suivre.
 */

/** A piece of code, read from the repository root, that makes a step necessary or a property true. */
export type CodeEvidence = { file: string; pattern: RegExp };
export type FrictionStep = { action: string; evidence: CodeEvidence };
export type FrictionPath = { key: string; label: string; steps: readonly FrictionStep[] };
export type FrictionCheck = { key: string; label: string; evidence: readonly CodeEvidence[] };

const PROJECTS_PAGE = 'apps/web/src/pages/ProjectsPage.tsx';
const PROJECT_FORM = 'apps/web/src/components/projects/ProjectForm.tsx';
const CHAT_PAGE = 'apps/web/src/pages/ChatPage.tsx';
const COMPOSER = 'apps/web/src/components/chat/MessageComposer.tsx';
const CONFIGURATION = 'apps/web/src/pages/ProjectConfiguration.tsx';
const TEAM_PIPELINE = 'apps/web/src/components/agents/AgentTeamPipeline.tsx';
const TEAM_SETUP = 'apps/web/src/components/agents/ProjectAgentSetup.tsx';
const MEMORY_PAGE = 'apps/web/src/pages/MemoriesPage.tsx';

const pickFromLibrary = (what: string, count: number): FrictionStep[] => Array.from({ length: count }, (_, index) => [
  { action: `Ouvrir « Ajouter depuis la bibliothèque » (${what} ${index + 1})`, evidence: { file: TEAM_PIPELINE, pattern: /Ajouter depuis la bibliothèque/ } },
  { action: `Choisir l’agent (${what} ${index + 1})`, evidence: { file: TEAM_PIPELINE, pattern: /<Select aria-label=\{label\}/ } },
]).flat();

const replaceFromLibrary = (what: string): FrictionStep[] => [
  { action: `Ouvrir « Remplacer depuis la bibliothèque » (${what})`, evidence: { file: TEAM_PIPELINE, pattern: /Remplacer depuis la bibliothèque/ } },
  { action: `Choisir l’agent (${what})`, evidence: { file: TEAM_PIPELINE, pattern: /<Select aria-label=\{label\}/ } },
];

/** Creating a playable project and playing a first turn, with nothing configured: the same path in V1 and V2. */
export const FIRST_TURN_PATH: FrictionPath = {
  key: 'premier-tour',
  label: 'Créer un projet jouable et jouer un premier tour',
  steps: [
    { action: 'Cliquer « Nouveau projet »', evidence: { file: PROJECTS_PAGE, pattern: />Nouveau projet</ } },
    { action: 'Saisir le nom du projet, seul champ obligatoire', evidence: { file: PROJECT_FORM, pattern: /label="Nom du projet" required/ } },
    { action: 'Cliquer « Enregistrer »', evidence: { file: PROJECT_FORM, pattern: />Enregistrer</ } },
    { action: 'Le projet s’ouvre sur sa configuration : cliquer l’onglet « Récit »', evidence: { file: PROJECTS_PAGE, pattern: /\?tab=config/ } },
    { action: 'Écrire la saisie', evidence: { file: COMPOSER, pattern: /aria-label="Votre message"/ } },
    { action: 'Cliquer « Envoyer »', evidence: { file: COMPOSER, pattern: /aria-label="Envoyer"/ } },
  ],
};

/** From a new project, open on its configuration, to the V2 team of the evaluation with memory routing. */
export const V2_TEAM_PATH: FrictionPath = {
  key: 'equipe-v2',
  label: 'Depuis un nouveau projet, obtenir l’équipe V2 évaluée (en plus du premier parcours)',
  steps: [
    { action: 'Ouvrir la section « Agents »', evidence: { file: CONFIGURATION, pattern: /label: 'Agents'/ } },
    ...pickFromLibrary('agent d’analyse', 5),
    { action: 'Ouvrir « Choisir dans la bibliothèque » (Directeur)', evidence: { file: TEAM_PIPELINE, pattern: /Choisir dans la bibliothèque/ } },
    { action: 'Choisir le Directeur', evidence: { file: TEAM_PIPELINE, pattern: /<Select aria-label=\{label\}/ } },
    ...replaceFromLibrary('Narrateur'),
    ...replaceFromLibrary('Gardien'),
    { action: 'Cliquer « Enregistrer l’équipe »', evidence: { file: TEAM_SETUP, pattern: /Enregistrer l’équipe/ } },
    { action: 'Ouvrir la section « Mémoire »', evidence: { file: CONFIGURATION, pattern: /label: 'Mémoire'/ } },
    { action: 'Cliquer « Proposer la configuration » (un appel LLM)', evidence: { file: MEMORY_PAGE, pattern: /label: 'Proposer la configuration'/ } },
    { action: 'Cliquer « Appliquer la proposition »', evidence: { file: MEMORY_PAGE, pattern: />Appliquer la proposition</ } },
  ],
};

export const FRICTION_CHECKS: readonly FrictionCheck[] = [
  {
    key: 'sans-configuration',
    label: 'Aucune configuration obligatoire : seul le nom est requis, un nouveau projet reçoit Narrateur et Gardien',
    evidence: [
      { file: 'packages/shared/src/projects.ts', pattern: /systemPrompt: z\.string\(\)\.trim\(\)\.max\(/ },
      { file: 'apps/api/src/modules/projects/services/projectServices.ts', pattern: /createDefaults\(project\.id\)/ },
    ],
  },
  {
    key: 'memoire-active',
    label: 'Mémoire active dès la création, avec les tags de départ',
    evidence: [{ file: 'apps/api/src/modules/projects/services/projectServices.ts', pattern: /saveSettings\(\{ tags: startingTags\(/ }],
  },
  {
    key: 'debug-a-la-demande',
    label: 'Mode Debug à la demande : aucun tiroir de tour ouvert par défaut',
    evidence: [{ file: CHAT_PAGE, pattern: /\[traceTurnId, setTraceTurnId\] = useState<string \| null>\(null\)/ }],
  },
];

/** Reads a repository file, or null when it cannot be read (absent file, unavailable reference). */
export type SourceReader = (file: string) => string | null;
export type EvidenceStatus = 'confirme' | 'absent' | 'illisible';

export function evidenceStatus(evidence: CodeEvidence, read: SourceReader): EvidenceStatus {
  const source = read(evidence.file);
  if (source === null) return 'illisible';
  return evidence.pattern.test(source) ? 'confirme' : 'absent';
}

export type PathReport = { key: string; label: string; actions: number; unconfirmed: string[] };
export type CheckReport = { key: string; label: string; holds: boolean | null };

export function pathReport(path: FrictionPath, read: SourceReader): PathReport {
  return {
    key: path.key, label: path.label, actions: path.steps.length,
    unconfirmed: path.steps.filter((step) => evidenceStatus(step.evidence, read) !== 'confirme').map((step) => step.action),
  };
}

/** True when every piece of evidence holds, false when one is missing, null when a file could not be read. */
export function checkReport(check: FrictionCheck, read: SourceReader): CheckReport {
  const statuses = check.evidence.map((evidence) => evidenceStatus(evidence, read));
  return {
    key: check.key, label: check.label,
    holds: statuses.includes('illisible') ? null : statuses.every((status) => status === 'confirme'),
  };
}

export type FrictionReport = {
  firstTurn: { v2: PathReport; v1: PathReport };
  v2Team: PathReport;
  checks: { v2: CheckReport[]; v1: CheckReport[] };
};

/** `readCurrent` reads this branch, `readV1` the V1 reference (`main`), so both are measured the same way. */
export function frictionReport(readCurrent: SourceReader, readV1: SourceReader): FrictionReport {
  return {
    firstTurn: { v2: pathReport(FIRST_TURN_PATH, readCurrent), v1: pathReport(FIRST_TURN_PATH, readV1) },
    v2Team: pathReport(V2_TEAM_PATH, readCurrent),
    checks: {
      v2: FRICTION_CHECKS.map((check) => checkReport(check, readCurrent)),
      v1: FRICTION_CHECKS.map((check) => checkReport(check, readV1)),
    },
  };
}
