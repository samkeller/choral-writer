import type { AnalysisItem, MemoryTag, NudgeType, TensionTarget } from '@choral-writer/shared';

/**
 * Contenu des projets de démonstration : fictif, anodin et public.
 *
 * Ce module ne fait que décrire. `demoRows.ts` en tire des lignes conformes aux schémas réels,
 * et `demoSeed.ts` les écrit. Pour enrichir la démo (nouvelle phase du pipeline, nouveau champ
 * de trace), compléter ces descriptions puis leur traduction dans `demoRows.ts`.
 */

/** Les identifiants fixes marquent les données de démo : un nouveau seed remplace exactement ces lignes. */
function demoId(suffix: number): string {
  return `019aee20-0000-7000-8000-${suffix.toString(16).padStart(12, '0')}`;
}

export type DemoAgent = {
  id: string;
  /** Une version par entrée, numérotée à partir de 1. */
  versions: readonly { id: string; name: string; instructions: string }[];
} & ({ phase: 'analysis'; output: 'envelope' } | { phase: 'direction'; output: 'direction' });

export type DemoTag = 'faits' | 'monde' | 'intentions' | 'fils';

/** Un agent de démo dans l'équipe d'un projet ou d'un tour. Le Narrateur et le Gardien par défaut s'y ajoutent toujours. */
export type DemoTeamMember = {
  agent: DemoAgent;
  version: number;
  /** Tags lus par un agent d'analyse ; le Directeur ne lit jamais la mémoire. */
  reads?: readonly DemoTag[];
};

export type DemoMemoryEntry = { key: string; content: string; tags: readonly DemoTag[]; protected?: boolean };

/** Une proposition du Gardien ; les souvenirs sont désignés par leur clé. */
export type DemoMemoryChange =
  | { op: 'create'; key: string; content: string; tags: readonly DemoTag[]; reason: string }
  | { op: 'edit'; key: string; content: string; reason: string }
  | { op: 'archive'; key: string; reason: string };

/**
 * La sortie du Directeur telle qu'il la renvoie : les contributions du whiteboard sont désignées
 * par `c1`, `c2`…, numérotées dans l'ordre des analyses du tour puis de leurs items.
 */
export type DemoDirection = {
  tension: TensionTarget;
  retained: readonly { item: string; why: string }[];
  dismissed: readonly { item: string; why: string }[];
  nudges: readonly { type: NudgeType; target: string; basis: string | null }[];
};

export type DemoAnalysis = {
  agent: DemoAgent;
  summary: string;
  items: readonly AnalysisItem[];
  /** Réponses au format invalide avant la bonne, comme une relance réelle. */
  invalidAttempts?: number;
};

export type DemoTurn = {
  ref: string;
  branch: 'main' | 'alternative';
  parent: string | null;
  /** Une régénération reprend le message utilisateur du tour régénéré. */
  regeneratedFrom?: string;
  input?: string;
  team: readonly DemoTeamMember[];
  /** Tour antérieur aux configurations enregistrées : ni configuration, ni coût, ni mémoire tracée. */
  legacy?: boolean;
  analysis: readonly DemoAnalysis[];
  direction?: DemoDirection;
  outcome:
    | { status: 'completed'; prose: string; memory: readonly DemoMemoryChange[] }
    | { status: 'failed'; error: string };
};

export type DemoProject = {
  id: string;
  name: string;
  systemPrompt: string;
  /** Équipe actuelle du projet. */
  team: readonly DemoTeamMember[];
  memory: readonly DemoMemoryEntry[];
  /** Dans l'ordre d'exécution : un parent précède toujours ses enfants. */
  turns: readonly DemoTurn[];
};

/** Jeu commun de tags, à l'image des tags de départ. */
export const demoTags: Record<DemoTag, Omit<MemoryTag, 'id'>> = {
  faits: { name: 'Faits', description: 'Ce qui est établi dans le récit et vrai dans le monde.' },
  monde: { name: 'Monde', description: 'Lieux, habitants et usages du monde du récit.' },
  intentions: { name: 'Intentions', description: 'Ce que chaque personnage poursuit d’un tour à l’autre.' },
  fils: { name: 'Fils ouverts', description: 'Questions et pistes que le récit n’a pas encore résolues.' },
};

const ines: DemoAgent = {
  id: demoId(0x101), phase: 'analysis', output: 'envelope',
  versions: [{
    id: demoId(0x201), name: 'Démo · Inès, gardienne du phare',
    instructions: 'Tu incarnes Inès Le Goff, gardienne du phare. Dis ce qu’elle veut, sait et accepte à ce tour.',
  }],
};

const offscreen: DemoAgent = {
  id: demoId(0x102), phase: 'analysis', output: 'envelope',
  versions: [{
    id: demoId(0x202), name: 'Démo · Hors champ du village',
    instructions: 'Tu fais vivre les habitants absents de la scène : ce qu’ils font pendant ce tour, hors champ.',
  }],
};

const chronicler: DemoAgent = {
  id: demoId(0x103), phase: 'analysis', output: 'envelope',
  versions: [
    {
      id: demoId(0x203), name: 'Démo · Chroniqueur de cohérence',
      instructions: 'Vérifie la cohérence des lieux et des horaires.',
    },
    {
      id: demoId(0x204), name: 'Démo · Chroniqueur de cohérence',
      instructions: 'Vérifie la cohérence des lieux, des horaires et des indices déjà trouvés.',
    },
  ],
};

const director: DemoAgent = {
  id: demoId(0x104), phase: 'direction', output: 'direction',
  versions: [{
    id: demoId(0x205), name: 'Démo · Directeur',
    instructions: 'Garde le rythme d’une enquête douce : au plus un indice nouveau par tour.',
  }],
};

const weather: DemoAgent = {
  id: demoId(0x105), phase: 'analysis', output: 'envelope',
  versions: [{
    id: demoId(0x206), name: 'Démo · Météo et terrain',
    instructions: 'Décris l’évolution du temps et du terrain, et ce qu’elle permet ou complique.',
  }],
};

export const demoAgents: readonly DemoAgent[] = [ines, offscreen, chronicler, director, weather];

const villageMembers = {
  ines: { agent: ines, version: 1, reads: ['intentions', 'faits'] },
  offscreen: { agent: offscreen, version: 1, reads: ['intentions', 'monde'] },
  chroniclerV1: { agent: chronicler, version: 1, reads: ['faits', 'fils'] },
  chroniclerV2: { agent: chronicler, version: 2, reads: ['faits', 'fils'] },
  director: { agent: director, version: 1 },
} satisfies Record<string, DemoTeamMember>;

const villageTeam = [villageMembers.ines, villageMembers.offscreen, villageMembers.chroniclerV2, villageMembers.director];

const village: DemoProject = {
  id: demoId(0x1),
  name: 'Démo · La cloche de Port-Lénic',
  systemPrompt: [
    'Enquête paisible à Port-Lénic, village côtier imaginaire.',
    'La cloche de la chapelle a disparu la veille de la fête des marées.',
    'L’utilisateur incarne Lou Garnier, enquêtrice venue du continent.',
    'Ton chaleureux et légèrement humoristique, sans violence.',
  ].join(' '),
  team: villageTeam,
  memory: [
    {
      key: 'Prémisse — la cloche disparue', tags: ['faits'], protected: true,
      content: 'La cloche de la chapelle Saint-Gildas a disparu dans la nuit qui précède la fête des marées.',
    },
    {
      key: 'Monde — Port-Lénic', tags: ['monde'],
      content: 'Un port de pêche, une chapelle sur la falaise, une halle aux poissons et un phare tenu par Inès Le Goff.',
    },
    {
      key: 'Intention — Inès Le Goff', tags: ['intentions'],
      content: 'Inès veut que la fête des marées ait lieu malgré tout. Elle se méfie des enquêteurs du continent.',
    },
    {
      key: 'Intention — le recteur Yves Kerbrat', tags: ['intentions'],
      content: 'Le recteur veut retrouver la cloche avant dimanche sans ébruiter l’affaire.',
    },
    {
      key: 'Fil ouvert — la clé du clocher', tags: ['fils'],
      content: 'Qui avait la clé du clocher la nuit de la disparition ?',
    },
  ],
  turns: [
    {
      ref: 'arrivee', branch: 'main', parent: null, legacy: true,
      team: [villageMembers.ines, villageMembers.offscreen],
      input: 'J’arrive au port et je demande à un pêcheur où se trouve la chapelle.',
      analysis: [
        {
          agent: ines, summary: 'Inès observe l’arrivée de l’enquêtrice depuis le phare.',
          items: [{ kind: 'intention', text: 'Inès veut savoir qui a fait venir une enquêtrice.', importance: 'NORMAL' }],
        },
        {
          agent: offscreen, summary: 'Le village s’agite autour des préparatifs de la fête.',
          items: [{ kind: 'hors champ', text: 'Le recteur répète son discours devant la halle vide.', importance: 'LOW' }],
        },
      ],
      outcome: {
        status: 'completed', memory: [],
        prose: 'Le car de la côte vous dépose sur le quai, entre deux casiers à homards. Un pêcheur aux bottes jaunes '
          + 'pointe sa pipe vers la falaise : « La chapelle ? Tout en haut. Mais sa cloche, elle, n’y est plus. » '
          + 'Au loin, la lanterne du phare tourne déjà, alors que le soleil n’est pas couché.',
      },
    },
    {
      ref: 'clocher', branch: 'main', parent: 'arrivee',
      team: [villageMembers.ines, villageMembers.offscreen, villageMembers.chroniclerV1, villageMembers.director],
      input: 'Je monte à la chapelle et j’examine le clocher vide.',
      analysis: [
        {
          agent: ines, summary: 'Inès voit la lumière de la lampe de poche dans le clocher.',
          items: [
            { kind: 'intention', text: 'Inès descend du phare pour voir ce que l’enquêtrice découvre.', importance: 'NORMAL' },
            { kind: 'perspective', text: 'Inès pense que la cloche est simplement tombée à la mer.', importance: 'LOW' },
          ],
        },
        {
          agent: offscreen, summary: 'Le recteur cherche partout la clé du clocher.',
          items: [{ kind: 'développement', text: 'Le recteur fouille la sacristie sans trouver la clé.', importance: 'NORMAL' }],
        },
        {
          agent: chronicler, summary: 'Le clocher porte des traces récentes.',
          items: [{ kind: 'indice', text: 'La corde de la cloche a été coupée net ; du sel a séché sur les marches.', importance: 'HIGH' }],
        },
      ],
      direction: {
        tension: 'monter',
        retained: [
          { item: 'c1', why: 'Rapproche Inès de la scène sans la révéler.' },
          { item: 'c3', why: 'Le recteur absent donne de la profondeur au village.' },
          { item: 'c4', why: 'Indice central du tour.' },
        ],
        dismissed: [{ item: 'c2', why: 'Une fausse piste trop tôt dans l’enquête.' }],
        nudges: [{ type: 'saillance', target: 'la corde coupée net', basis: null }],
      },
      outcome: {
        status: 'completed',
        memory: [{
          op: 'create', key: 'Indice — la corde coupée', tags: ['faits', 'fils'],
          content: 'La corde de la cloche a été coupée net ; des traces de sel séché marquent les marches du clocher.',
          reason: 'Lou a établi cet indice en examinant le clocher.',
        }],
        prose: 'L’escalier en colimaçon sent la pierre humide. En haut, le joug de bois est vide et la corde pend, '
          + 'tranchée d’un coup franc. Sur les marches, des auréoles blanches crissent sous vos semelles : du sel, '
          + 'comme si quelqu’un était monté tout droit depuis la mer. Par la lucarne, une silhouette quitte le phare.',
      },
    },
    {
      ref: 'phare', branch: 'main', parent: 'clocher', team: villageTeam,
      input: 'Je vais au phare interroger Inès.',
      analysis: [
        {
          agent: ines, summary: 'Inès protège quelqu’un et le cache mal.', invalidAttempts: 1,
          items: [
            { kind: 'intention', text: 'Inès veut éviter qu’on soupçonne son neveu Malo.', importance: 'HIGH' },
            { kind: 'réplique possible', text: 'Inès propose du thé pour gagner du temps.', importance: 'LOW' },
          ],
        },
        {
          agent: offscreen, summary: 'Malo travaille loin des regards.',
          items: [
            { kind: 'développement', text: 'Malo ponce quelque chose de lourd dans le hangar à bateaux.', importance: 'NORMAL' },
            { kind: 'hors champ', text: 'Le recteur annonce que la fête aura lieu, cloche ou pas.', importance: 'LOW' },
          ],
        },
        {
          agent: chronicler, summary: 'Les horaires de marée comptent.',
          items: [{ kind: 'cohérence', text: 'La marée était haute vers minuit, la nuit de la disparition.', importance: 'NORMAL' }],
        },
      ],
      direction: {
        tension: 'tenir',
        retained: [
          { item: 'c1', why: 'Le cœur de la scène avec Inès.' },
          { item: 'c2', why: 'Un geste qui trahit sa gêne.' },
          { item: 'c5', why: 'Donne à Lou de quoi relier le sel à la marée.' },
        ],
        dismissed: [
          { item: 'c3', why: 'Révélerait trop tôt la piste de Malo.' },
          { item: 'c4', why: 'Sans lien avec la scène du phare.' },
        ],
        nudges: [
          { type: 'pression', target: 'Inès veut détourner les soupçons de son neveu', basis: 'c1' },
          { type: 'retard', target: 'l’origine des traces de sel', basis: null },
        ],
      },
      outcome: {
        status: 'completed',
        memory: [
          {
            op: 'edit', key: 'Intention — Inès Le Goff',
            content: 'Inès veut que la fête ait lieu et détourner les soupçons de son neveu Malo.',
            reason: 'Inès a esquivé chaque question sur sa famille.',
          },
          {
            op: 'create', key: 'Intention — Malo Le Goff', tags: ['intentions'],
            content: 'Malo veut réparer en secret la cloche fêlée pour l’offrir au village pendant la fête.',
            reason: 'Le récit établit hors champ que Malo travaille sur un objet lourd.',
          },
        ],
        prose: 'Inès vous ouvre avant que vous ne frappiez, une théière déjà fumante à la main. « Les gens du continent '
          + 'aiment le thé, non ? » Elle parle de la marée, du vent, de la fête, de tout sauf de sa famille. Quand vous '
          + 'évoquez le sel sur les marches, elle repose sa tasse un peu trop vite.',
      },
    },
    {
      ref: 'marche', branch: 'main', parent: 'phare', team: villageTeam,
      input: 'Je propose à Inès de m’accompagner au marché de la fête.',
      analysis: [
        {
          agent: ines, summary: 'Inès hésite, puis accepte pour surveiller Lou.',
          items: [{ kind: 'intention', text: 'Inès accepte pour garder un œil sur l’enquêtrice.', importance: 'NORMAL' }],
        },
        {
          agent: offscreen, summary: 'Le marché s’installe sur le port.',
          items: [
            { kind: 'développement', text: 'Les marchands installent leurs étals sur le quai.', importance: 'LOW' },
            { kind: 'hors champ', text: 'Malo charge une forme bâchée sur une charrette.', importance: 'NORMAL' },
          ],
        },
        {
          agent: chronicler, summary: 'Le clocher n’a jamais eu de serrure.',
          items: [{ kind: 'cohérence', text: 'La porte du clocher ne ferme plus depuis des années.', importance: 'NORMAL' }],
        },
      ],
      direction: {
        tension: 'relacher',
        retained: [
          { item: 'c1', why: 'Une trêve entre Lou et Inès.' },
          { item: 'c2', why: 'L’ambiance de fête qui détend la scène.' },
          { item: 'c4', why: 'Ferme une fausse piste.' },
        ],
        dismissed: [{ item: 'c3', why: 'Garder Malo hors de la scène encore un tour.' }],
        nudges: [{ type: 'relance', target: 'les habitants à interroger au marché', basis: null }],
      },
      outcome: {
        status: 'completed',
        memory: [
          {
            op: 'archive', key: 'Fil ouvert — la clé du clocher',
            reason: 'La scène établit que la porte du clocher ne ferme plus.',
          },
          {
            op: 'create', key: 'Fait — le clocher reste ouvert', tags: ['faits'],
            content: 'La porte du clocher ne ferme plus depuis des années : n’importe qui pouvait y monter.',
            reason: 'Établi par le récit au marché.',
          },
        ],
        prose: 'Inès noue un foulard bleu et vous suit sur le quai, où les étals sentent la crêpe et le goudron. '
          + 'Le vieux Fañch rit quand vous parlez de la clé du clocher : « Une clé ? Cette porte ne ferme plus depuis '
          + 'le baptême de mon petit-fils ! » Inès sourit enfin, et désigne du menton le stand du cidre.',
      },
    },
    {
      ref: 'quais', branch: 'main', parent: 'marche', team: villageTeam,
      input: 'Je cherche Malo sur les quais.',
      analysis: [
        {
          agent: ines, summary: 'Inès s’inquiète de la question.',
          items: [{ kind: 'intention', text: 'Inès cherche une excuse pour s’éloigner.', importance: 'NORMAL' }],
        },
        {
          agent: offscreen, summary: 'Malo n’est plus au hangar.',
          items: [{ kind: 'développement', text: 'Malo pousse sa charrette vers la chapelle par le sentier côtier.', importance: 'HIGH' }],
        },
        {
          agent: chronicler, summary: 'Rien d’incohérent.',
          items: [{ kind: 'cohérence', text: 'Le sentier côtier relie le hangar à la chapelle en vingt minutes.', importance: 'LOW' }],
        },
      ],
      direction: {
        tension: 'monter',
        retained: [
          { item: 'c1', why: 'La gêne d’Inès nourrit la scène.' },
          { item: 'c2', why: 'Un développement qui fait avancer l’intrigue.' },
          { item: 'c3', why: 'Garantit des distances crédibles.' },
        ],
        dismissed: [],
        nudges: [{ type: 'complication', target: 'la recherche de Malo sur les quais', basis: null }],
      },
      outcome: { status: 'failed', error: 'Le fournisseur LLM a interrompu la réponse avant sa fin.' },
    },
    {
      ref: 'marche-refus', branch: 'alternative', parent: 'phare', regeneratedFrom: 'marche',
      team: [villageMembers.ines, villageMembers.offscreen, villageMembers.chroniclerV2],
      analysis: [
        {
          agent: ines, summary: 'Inès refuse de quitter le phare.',
          items: [{ kind: 'intention', text: 'Inès refuse : la lanterne doit être réglée avant la nuit.', importance: 'HIGH' }],
        },
        {
          agent: offscreen, summary: 'Le marché s’installe sans Inès.',
          items: [{ kind: 'développement', text: 'Le recteur cherche des bras pour porter les bannières.', importance: 'LOW' }],
        },
        {
          agent: chronicler, summary: 'La lanterne tourne trop tôt depuis deux jours.',
          items: [{ kind: 'cohérence', text: 'La lanterne tournait déjà avant le coucher du soleil à l’arrivée de Lou.', importance: 'NORMAL' }],
        },
      ],
      outcome: {
        status: 'completed',
        memory: [{
          op: 'create', key: 'Fait — Inès reste au phare', tags: ['faits'],
          content: 'Inès a refusé d’aller au marché : elle dit devoir régler la lanterne avant la nuit.',
          reason: 'Inès a refusé l’invitation de Lou.',
        }],
        prose: '« Le marché ? » Inès secoue la tête et montre l’escalier qui monte vers la lanterne. « Elle tourne trop '
          + 'tôt depuis deux jours. Quelqu’un a touché au mécanisme. » Elle vous raccompagne jusqu’à la porte, poliment, '
          + 'fermement. Derrière vous, le verrou claque deux fois.',
      },
    },
  ],
};

const mountainTeam = [{ agent: weather, version: 1, reads: ['monde', 'fils'] }] satisfies DemoTeamMember[];

const mountain: DemoProject = {
  id: demoId(0x2),
  name: 'Démo · Expédition au col des Brumes',
  systemPrompt: [
    'Récit d’aventure contemplative en montagne imaginaire.',
    'L’utilisateur incarne Sacha, guide d’une petite expédition vers le refuge du col des Brumes.',
    'Pas de danger grave : l’enjeu est le chemin, le temps et l’entente du groupe.',
  ].join(' '),
  team: mountainTeam,
  memory: [
    {
      key: 'Prémisse — l’expédition', tags: ['faits'], protected: true,
      content: 'Trois marcheurs partent du village de Valmorte pour rejoindre le refuge du col des Brumes.',
    },
    {
      key: 'Monde — le col des Brumes', tags: ['monde'],
      content: 'Un col herbeux souvent pris dans le brouillard, balisé par des cairns, avec un refuge de pierre au sommet.',
    },
    {
      key: 'Intention — Noé, le porteur', tags: ['intentions'],
      content: 'Noé veut atteindre le refuge avant la nuit pour y retrouver sa sœur, gardienne du refuge.',
    },
    { key: 'Fil ouvert — le cairn renversé', tags: ['fils'], content: 'Qui a renversé le grand cairn du premier lacet ?' },
  ],
  turns: [
    {
      ref: 'depart', branch: 'main', parent: null, team: mountainTeam,
      input: 'Nous quittons le village à l’aube ; je vérifie le matériel de chacun.',
      analysis: [{
        agent: weather, summary: 'Ciel clair, brume attendue l’après-midi.',
        items: [
          { kind: 'météo', text: 'Le ciel est dégagé mais la brume montera vers midi.', importance: 'HIGH' },
          { kind: 'terrain', text: 'Le premier lacet est boueux après la pluie de la veille.', importance: 'LOW' },
        ],
      }],
      outcome: {
        status: 'completed',
        memory: [{
          op: 'create', key: 'Fait — départ à l’aube', tags: ['faits'],
          content: 'Le groupe a quitté Valmorte à l’aube, matériel vérifié ; la brume est attendue vers midi.',
          reason: 'Le départ est établi par la scène.',
        }],
        prose: 'Le village dort encore quand vous resserrez la dernière sangle. Noé a trop chargé son sac, comme '
          + 'toujours ; Lise a oublié ses gants, comme toujours. Au-dessus des toits, le col se découpe net sur un ciel '
          + 'pâle, mais une ligne blanche s’étire déjà sur les crêtes de l’ouest.',
      },
    },
    {
      ref: 'cairn', branch: 'main', parent: 'depart', team: mountainTeam,
      input: 'Au cairn renversé, je le reconstruis avant de continuer.',
      analysis: [{
        agent: weather, summary: 'La brume arrive plus tôt que prévu.',
        items: [{ kind: 'météo', text: 'La brume recouvre le premier lacet pendant la reconstruction.', importance: 'NORMAL' }],
      }],
      outcome: {
        status: 'completed', memory: [],
        prose: 'Pierre après pierre, le cairn reprend sa forme. Noé tend les plus lourdes, Lise choisit la pierre du '
          + 'sommet avec un sérieux de cérémonie. Quand vous vous relevez, la brume a avalé le village : il ne reste que '
          + 'le cairn, le sentier, et le bruit d’une sonnaille quelque part plus haut.',
      },
    },
  ],
};

export const demoProjects: readonly DemoProject[] = [village, mountain];
