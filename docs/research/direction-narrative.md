# Direction narrative par nudges (drama management)

Recherche pour le ticket #18 (carte #2). Elle prépare le ticket #8.
Date : 2026-11-21.

Elle complète deux recherches déjà faites, sans les refaire :

- `research/planification-et-creativite` : planification par points de bascule (Tian et al. 2024), Agents' Room, Re3/DOC.
- `research/mecanismes-narratifs` : description du pipeline (§1) et mécanismes M1 à M14, dont la médiation intervention / accommodation (M11) et les îlots de l'*Automated Story Director* (M8, M11).

## Question

Que dit la recherche sur la **direction narrative** (drama management, experience management, agents « directeurs ») quand il faut orienter un récit interactif **sans fixer son issue** ?

1. Quelles formes prend une intervention du directeur ? Lesquelles produisent tension et surprise, lesquelles « referment » la scène ?
2. Comment le directeur se coordonne-t-il avec des agents-personnages autonomes sans écraser leur volonté ?
3. Qu'ont montré les travaux récents à base de LLM ?

**Cadre de décision (rappel).** Une phase de **direction** facultative (agent : Directeur) s'exécute après les agents d'analyse en parallèle et avant le Narrateur, qui écrit la prose en streaming. Le Directeur lit le whiteboard et la saisie. Il retient les contributions pertinentes, en transmet le détail au Narrateur et écarte les autres. Il doit orienter le récit sans en fixer l'issue : une `<resolution>` écrite d'avance a aplati la prose. Les agents qui incarnent un personnage font autorité sur ce que ce personnage veut ou accepte. Le Directeur construit autour de leurs refus et ne les annule jamais. Le pipeline peut contredire l'*issue* d'une tentative du protagoniste et les réactions des autres personnages, mais jamais ce que le protagoniste *fait* ou *dit*. Le mainteneur veut que le pipeline surprenne l'utilisateur.

**Conventions.**

- Chaque affirmation renvoie à une source lue. « Texte intégral » signifie que le corps de l'article a été lu (extraction texte du PDF).
- **[non vérifié]** : seul le résumé a été lu, ou l'affirmation vient d'une source secondaire.
- **[inférence]** : transposition de ma part au cas de Choral-writer, que la source n'affirme pas.
- Un « appel » est un appel LLM supplémentaire par tour.

---

## Résumé

1. **Un directeur classique ne décide pas des issues, il déplace des probabilités.** Dans la lignée Bates, Weyhrauch, DODM, le vocabulaire du directeur est fait d'actions abstraites : *hint* (rendre un événement plus probable), *temp_deny* (le différer), *deny*, *cause*, *game ending*. Une métrique, la *manipulativity*, pénalise les interventions visibles ([DODM] ; [RI08] §4.1). Seul *cause* fixe un résultat, et c'est l'action la plus manipulatrice.
2. **Façade sélectionne une cible de tension, pas un événement.** Le gestionnaire de beats choisit le beat dont l'effet sur la tension colle le mieux à une courbe de tension ; le joueur et les personnages décident de la manière dont il se joue ([FAC] ; [RI08] §6.2). Les auteurs notent que la variété du « comment » compte plus que celle du « quoi ».
3. **Les directives aux personnages semi-autonomes sont de deux sortes : prescriptives (« atteins tel état ») et proscriptives (« ne fais rien qui défasse tel état »).** Elles restent assez abstraites pour que le personnage choisisse comment agir ([ASD] §2.4, §3.2). Dans [ASD], défaire le plan est un droit réservé au participant ; Thespian ne modifie un personnage que dans la plage de motivations qui reste cohérente avec ce qu'il a déjà montré ([TH10] §3.2).
4. **Les travaux LLM confirment les risques d'un directeur trop directif.**
   - Donner à un acteur la réplique attendue le pousse à la recopier ; IBSEN ne transmet donc qu'un résumé, un synopsis et des mots-clés ([IBSEN] §3.1.2).
   - Un LLM qui replanifie modifie trop le plan : Wu et al. bornent la réflexion à **un seul** point d'intrigue modifié ou ajouté par étape ([WU25] §4.2).
   - Le passage par le directeur perd de l'information : la progression baisse de 4,3 à 3,6 sur 5 ([WU25] §5.2).
5. **Un menu d'actions typées choisi par un LLM bat la génération libre en intérêt et en surprise, mais le choix s'effondre sur une action dominante.** Dans SWAG, GPT-4 choisissait « add suspense » de façon disproportionnée, et il a fallu rééquilibrer les données ([SWAG] §3.1).
6. **Aucun gestionnaire ne domine sur tous les critères.** Sur un même scénario, la réparation par MCTS fait monter la robustesse (0,58 → 0,76) et baisser l'agentivité (0,44 → 0,27). Les personnages autonomes donnent la meilleure agentivité (0,68), mais l'intention d'auteur tombe à 0,04 ([CL26] §6).

**Recommandation en une phrase [inférence].** Le Directeur produit une **sélection de contributions** et **un ou deux nudges typés** : des pressions, des retards, des complications, des interdits de résolution, une cible de tension. Il ne produit **jamais d'issue** ni de prose (§6).

---

## Sources consultées

| Réf. | Source | Statut de lecture |
|---|---|---|
| [RB13] | Riedl & Bulitko, *Interactive Narrative: An Intelligent Systems Approach*, AI Magazine 34(1), 2013, p. 67-77 ([PDF](https://cs.uky.edu/~sgware/reading/papers/riedl2013interactive.pdf)) | Texte intégral |
| [RI08] | Roberts & Isbell, *A Survey and Qualitative Analysis of Recent Advances in Drama Management*, ITSSA 4(2), 2008 ([PDF](https://www.cs.uky.edu/~sgware/reading/papers/roberts2008survey.pdf)) | Texte intégral |
| [DODM] | Nelson, Mateas, Roberts, Isbell, *Declarative Optimization-Based Drama Management in Interactive Fiction*, IEEE CG&A 26(3), 2006 ([PDF](https://cs.uky.edu/~sgware/reading/papers/nelson2006declarative.pdf)) | Texte intégral |
| [FAC] | Mateas & Stern, *Structuring Content in the Façade Interactive Drama Architecture*, AIIDE 2005 ([PDF](https://cdn.aaai.org/AIIDE/2005/AIIDE05-016.pdf)) | Texte intégral |
| [ASD] | Riedl, Stern, Dini, Alderman, *Dynamic Experience Management in Virtual Worlds for Entertainment, Education, and Training*, ITSSA 3(1), 2008 ([préprint](https://cs.uky.edu/~sgware/reading/papers/riedl2008dynamic.pdf)) | Texte intégral |
| [IDA] | Magerko, Laird, Assanie, Kerfoot, Stokes, *AI Characters and Directors for Interactive Computer Games*, IAAI 2004 ([PDF](https://cdn.aaai.org/IAAI/2004/IAAI04-016.pdf)) | Texte intégral |
| [TH10] | Si, Marsella, Pynadath, *Evaluating Directorial Control in a Character-Centric Interactive Narrative Framework*, AAMAS 2010 ([PDF](https://ifaamas.csc.liv.ac.uk/Proceedings/aamas2010/pdf/01%20Full%20Papers/26_05_FP_0727.pdf)) | Texte intégral |
| [PAS] | Thue, Bulitko, Spetch, Wasylishen, *Interactive Storytelling: A Player Modelling Approach* (PaSSAGE), AIIDE 2007 ([PDF](https://cdn.aaai.org/ojs/18780/18780-52-22477-1-10-20210929.pdf)) | Texte intégral |
| [IDT] | Szilas, *IDtension – Highly Interactive Drama*, démo AIIDE 2008 ([PDF](https://cdn.aaai.org/ojs/18704/18704-52-22325-1-10-20210927.pdf)) | Texte intégral (2 pages). Le modèle complet (Szilas 2007, *Applied AI* 21(8)) n'a pas été lu. |
| [IBSEN] | Han et al., *IBSEN: Director-Actor Agent Collaboration for Controllable and Interactive Drama Script Generation*, ACL 2024 ([arXiv:2407.01093](https://arxiv.org/abs/2407.01093)) | Texte intégral |
| [WU25] | Wu et al., *Towards Enhanced Immersion and Agency for LLM-based Interactive Drama*, ACL 2025 ([arXiv:2502.17878v2](https://arxiv.org/abs/2502.17878)) | Texte intégral |
| [SWAG] | Pei et al., *SWAG: Storytelling With Action Guidance*, Findings EMNLP 2024 ([arXiv:2402.03483v2](https://arxiv.org/abs/2402.03483)) | Texte intégral |
| [DM26] | Wang et al., *An Authoring Framework for LLM-Based Drama Managers* (Dramamancer), I3D Companion 2026 ([PDF](https://mkremins.github.io/publications/Dramamancer_I3D2026.pdf)), et *Design Techniques for LLM-Powered Interactive Storytelling: A Case Study of the Dramamancer System* ([arXiv:2601.18785](https://arxiv.org/abs/2601.18785)) | Texte intégral (articles courts, sans évaluation chiffrée) |
| [HAM] | Chen et al., *HAMLET: Hyperadaptive Agent-based Modeling for Live Embodied Theatrics*, [arXiv:2507.15518v2](https://arxiv.org/abs/2507.15518) | Lecture partielle (architecture et annexes de prompts) |
| [CL26] | Clerc, Lourdeaux, Sallak, Ravaine, *Creating Hybrid Interactive Narrative Systems with LLM: From Formal Description to Evaluation*, [arXiv:2611.02807](https://arxiv.org/abs/2611.02807) | Texte intégral |
| [OT25] | *Open-Theatre: An Open-Source Toolkit for LLM-based Interactive Drama*, [arXiv:2509.16713](https://arxiv.org/abs/2509.16713) | Lecture partielle (architecture) |

Sources citées seulement à travers les précédentes :

- Bates 1992, à travers [RB13].
- Weyhrauch 1997, thèse, à travers [DODM] et [RI08] §4.1.
- Blumberg & Galyean, à travers [ASD] §3.2.
- Magerko 2005, à travers [RB13].

**[non vérifié]** pour leur texte d'origine.

---

## 1. Le cadre : ce qu'est un directeur

- **Définition.** Un drama manager est « *an intelligent, omniscient, and disembodied agent that monitors the virtual world and intervenes to drive the narrative forward according to some model of quality of experience* » ([RB13], section *Experience Management*, attribué à Bates 1992). L'*experience manager* généralise la notion aux récits non dramatiques. Il intervient « *typically by directing computer-controlled characters* ». L'utilisateur ne devrait percevoir ni le gestionnaire ni ses interventions.
- **Il ne cherche pas la suite la plus probable.** Le gestionnaire projette des futurs possibles et retient « *the best narrative sequence* » selon des critères d'auteur. Cette séquence « *does not have to be — and often should not be — the most likely sequence of events* » ([RB13], même section).
- **Trois axes pour situer un système** ([RB13], *A Taxonomy of Approaches*) :
  - l'intention d'auteur, de « graphe figé » à « génératif » ;
  - l'autonomie des personnages : en *strong story*, ils ne font rien sans le gestionnaire ; en *strong autonomy*, ils ignorent les besoins du récit ;
  - la modélisation du joueur.
- **Les approches intermédiaires.** Elles dominent. Dans Façade, les personnages décident *comment* se réalisent les unités d'intrigue. Dans [ASD], les personnages sont autonomes jusqu'à ce qu'une directive arrive ([RB13], *Virtual Character Autonomy*).
- **Le problème de la frontière.** Il est déjà traité par M11 (`mecanismes-narratifs`). Face à une action qui sort du récit prévu, le gestionnaire **intervient** (diriger un PNJ autrement, modifier le monde) ou **accommode** (laisser faire et regénérer la suite) ([RB13], *Authorial Intent*).
- **Les desiderata de [RI08] §2.** Les plus utiles ici :
  - *Player Autonomy* : « *players should not be so constrained by the drama manager that they cannot pursue their own goals* » ;
  - *Invisibility* : « *should not appear overly manipulative* » ;
  - *Replayability* : « *varied but retain high quality* » ;
  - *Speed* : pas de délai perceptible.

  [RI08] note que l'autonomie du joueur et le contrôle de l'auteur sont en tension et qu'un compromis est inévitable.

**Lecture pour Choral-writer [inférence].** Le Directeur prévu est un experience manager de position intermédiaire. Les agents-personnages ont l'autorité de *strong autonomy* sur leur personnage. Le Directeur ne garde qu'un levier indirect : ce qu'il met en avant pour le Narrateur.

---

## 2. Formes d'intervention dans la littérature fondatrice

Chaque fiche donne le principe, la forme de la sortie du directeur, l'effet mesuré s'il existe, le coût et la transposition.

### D1. Actions abstraites sur des points d'intrigue (SBDM, DODM)

- **Principe.** Le récit est abstrait en points d'intrigue avec des contraintes de précédence. Le directeur choisit des actions qui maximisent une fonction d'évaluation écrite par l'auteur, en projetant des futurs (recherche, puis apprentissage par renforcement) ([DODM] ; [RI08] §4.1-4.2).
- **Forme de la sortie : un vocabulaire fermé d'actions.**
  - [RI08] §4.1 : « *cause, deny, temp_deny, reenable, and hint* », plus le choix de **ne rien faire** (« *allowing the player to be the sole influence on plot progression* »).
  - [DODM], *Types of DM actions* : *permanent deniers*, *temporary deniers*, *causers*, *hints*, *game endings*. Un *hint* rend un point d'intrigue plus probable, « *with an associated multiplier and duration* ».
  - Dans *Anchorhead* : 4 deniers permanents, 5 temporaires et leurs 5 réactivateurs, 4 causers, 10 hints et 2 fins, soit 30 actions.
- **Ce que l'auteur apprend.**
  - Les deniers permanents sont risqués, car ils forcent des choix irréversibles. Les **deniers temporaires sont préférables**, « *since they can always be undone* » ([DODM]).
  - Les actions passent mieux par les personnages, « *since they can often be plausibly made to start conversations, perform actions* ». Il ne faut pas « *simply make strange things happen in front of the player's eyes* » ([DODM]).
  - La fonction d'évaluation comporte des **méta-critères** sur le directeur lui-même. *Choices* mesure combien d'options restent ouvertes au joueur. *Manipulativity* donne à chaque action un score qui estime la probabilité que le joueur la remarque : « *subtle hints might be judged to be less manipulative than outright causers* » ([DODM], *Metafeatures*).
- **Effet mesuré.** Sur des joueurs simulés, le DODM par renforcement améliore le score d'évaluation, mais « *the system finds a narrow set of good stories and drives the player towards them* » : la rejouabilité baisse ([RI08] §4.2). Les TTD-MDP visent une *distribution* de trajectoires pour corriger ce défaut ([RI08] §4.3). Aucune mesure ne porte sur la surprise.
- **Coût.** Le calcul se fait hors ligne. Il n'y a pas d'équivalent LLM direct.
- **Transposition [inférence].**
  - C'est la meilleure source pour un **vocabulaire de nudges**. *hint* et *temp_deny* orientent sans fixer, *cause* fixe, *ne rien faire* est une option légitime.
  - La *manipulativity* se transpose en règle : préférer le nudge le moins visible, passer par un personnage ou par le monde plutôt que par une coïncidence.
  - Le méta-critère *choices* rejoint la règle du projet : ne pas fermer les options du protagoniste.

### D2. Beats et courbe de tension (Façade)

- **Principe.** Façade découpe le récit en *beats* de 10 à 100 *joint dialog behaviors*. Chaque beat est organisé autour d'un but narratif (« *a brief conflict about a topic* » ou « *the revelation of an important secret* ») et peut modifier des valeurs d'état, dont la **tension globale** ([FAC], *Beats, Beat Goals and Beat Mix-ins*).
- **Forme de la sortie : le choix du prochain beat.** « *The unused beat whose preconditions are satisfied and whose story tension effects most closely match the near-term trajectory of an author-specified story tension arc […] is the one chosen; weights and priorities also influence the decision* » ([FAC]). La courbe est aristotélicienne.
- **À l'intérieur d'un beat.**
  - Une séquence canonique : transition d'entrée, *body goals*, *wait goal* (attente de la réaction du joueur), transition de sortie.
  - Des *handlers* qui insèrent des *mix-ins* en réaction aux actes du joueur.
  - La transition de sortie révèle de l'information et montre « *how the player's action within the beat has changed the affinity dynamic* » : c'est le joueur qui fait l'issue du beat.
- **Effet observé (qualitatif).** « *More significant than variations of beat sequences ("what" happened) are variations within beats and global mix-in progressions ("how" it happened)* » ([FAC], *Global Agency*). [RI08] §6.2 : le beat définit « *an expectation over value change* », pas un résultat.
- **Coût.** Très bas à l'exécution, très élevé en écriture.
- **Transposition [inférence].**
  - Façade est l'antécédent direct d'un directeur qui **vise un changement de valeur** (« la tension monte », « la confiance entre A et B vacille ») sans écrire ce qui se passe.
  - La courbe de tension correspond aux points de bascule de Tian et al. (`planification-et-creativite`) : le Directeur peut tenir une **cible de tension par tour**, montée, palier, relâchement ou bascule.

### D3. Directives prescriptives et proscriptives à des personnages semi-autonomes (ASD, IDA)

- **Principe.** [ASD] §2.4 : les étapes du plan narratif deviennent des **directives**.
  - *Prescriptive* : « *achieve some world state* ». Elle doit être « *of sufficiently high level that character agents are free to achieve the directive in a way that best demonstrates the characteristics of that character* ».
  - *Proscriptive* : « *avoid particular states* ». Elle est dérivée des liens causaux qui traversent la coupe entre le passé et l'avenir du plan.
- **Forme de la sortie.**
  - Des buts que le personnage adopte, en reprenant la formule de Blumberg & Galyean : « *do X* » et « *I don't care what you do as long as you don't do Y* » ([ASD] §3.2).
  - Le personnage alterne des comportements autonomes (*LABs*, sa « vie intérieure ») et des comportements narratifs (*NDBs*) déclenchés par le directeur.
  - Le dialogue n'est **pas dicté** : « *the Story Director only insists that Red be eaten by the Wolf* », et les personnages improvisent la scène ([ASD] §4).
- **Partage des droits.** « *Interfering with the currently executing narrative plan is a right only bestowed upon the interactive participant* » ([ASD] §2.4). Si le participant ne fait pas ce que le plan attend, un échec se déclenche après un délai et le récit s'adapte (§4).
- **Granularité variable.** Dans [IDA], le directeur donne des ordres très généraux (« *be social* ») ou très précis (une réplique donnée), selon que le détail compte ou non ([IDA], *Autonomy and Directability*). Ses commandes sont rangées par type de situation, pas liées à une précondition précise ([IDA], *Story Director*). Un personnage qui reçoit une direction doit trouver comment l'intégrer « *while still maintaining coherent behavior* » ([IDA], *Conclusions & Future Work*).
- **Effet mesuré.** Aucun sur l'expérience. [RI08] §5.3 juge [ASD] adapté à la formation plus qu'au divertissement, avec une rejouabilité qui ne vient que du joueur.
- **Coût.** Dans [ASD], un arbre de contingences précalculé hors ligne.
- **Transposition [inférence].**
  - La paire prescriptif / proscriptif se transpose presque telle quelle, à une différence près : le Directeur ne peut pas diriger les agents-personnages **pendant** le tour, puisqu'ils ont déjà parlé en parallèle. Ses directives s'adressent donc au **Narrateur**, qui rend le monde et les PNJ.
  - La **proscriptive** est l'outil le plus utile contre l'aplatissement : « ne pas résoudre X ce tour », « ne pas révéler Y ». Elle laisse ouvert tout le reste.
  - La règle de [ASD] sur les droits du participant correspond exactement à la règle du projet : le protagoniste agit librement, et seule l'issue de sa tentative peut être infléchie.

### D4. Direction préemptive par modèle du joueur (IDA)

- **Principe.** Le directeur simule périodiquement le joueur : à partir des connaissances qu'il lui suppose, se comportera-t-il « *in a manner that will keep the plot from continuing?* ». Si la simulation échoue, il agit **avant** la rupture. Les auteurs revendiquent l'« *alteration of the story state in subtle ways* » pour éviter des actions problématiques futures ([IDA], *Story Director*).
- **Forme de la sortie.** Des directions aux personnages ou au monde, choisies par type de situation (par exemple faire découvrir un indice manquant).
- **Effet mesuré.** Aucun : l'article ne montre que la faisabilité. Selon [RI08] §5.1, IDA se distingue par son invisibilité, et la perception d'autonomie qu'elle produit « *has not been explicitly measured* ».
- **Coût.** Une simulation de plus par déclenchement.
- **Transposition [inférence] : faible.** Choral-writer n'a pas de plan à protéger. L'idée utile est la **relance** : si l'utilisateur tourne en rond faute d'information, le Directeur rend saillant ce qui lui manque (un *hint* au sens de D1).

### D5. Contrôle directorial limité aux motivations cohérentes (Thespian)

- **Principe.** Thespian est un cadre *centré personnages* : chaque personnage est un agent à buts pondérés. Une procédure de *fitting* déduit, à partir d'exemples de parcours, une **plage** de poids de buts qui explique le comportement de chaque personnage ([TH10] §3.1.3).
- **Forme de la sortie.** Le directeur, omniscient, modifie les **croyances** et les **comportements** des personnages, ou des faits du monde que l'utilisateur ne voit pas (« *the director agent can freely arrange the locations of characters whom the user cannot see* »). Chaque suggestion passe un filtre : elle est écartée si aucune motivation cohérente avec le comportement passé ne l'explique (§3.2). Les objectifs directoriaux sont des contraintes temporelles et d'ordre partiel sur les actions et croyances, de six types (tableau 1).
- **Effet mesuré.** Sur des utilisateurs **simulés** (25 tours, 200 à 450 interactions par échantillon, 10 échantillons) :
  - sans directeur, les objectifs directoriaux ne sont jamais atteints ;
  - avec directeur, ils le sont dans environ 70 à 80 % des cas (§4.2, figure 1), parfois avec retard (§4.3).
  - Ni le plaisir ni la surprise ne sont mesurés.
- **Coût.** Une recherche par tour, filtrée.
- **Transposition [inférence].**
  - C'est le modèle le plus proche de la règle « les agents-personnages font autorité ». Le directeur ne pousse que **dans la plage de ce que le personnage accepterait**, et le *fitting* joue le rôle de l'agent-personnage.
  - Le Directeur ne doit donc fonder un nudge sur un personnage incarné qu'à partir de sa contribution, et retourner un refus en obstacle.
  - L'**invisible** (hors champ, non observé) reste un terrain libre pour les événements du monde, ce qui rejoint M8.

### D6. Choix du contenu selon un modèle du joueur (PaSSAGE)

- **Principe.** Le système estime le style du joueur sur cinq types (*Fighter*, *Power Gamer*, *Tactician*, *Storyteller*, *Method Actor*) et choisit, dans une bibliothèque, la *rencontre* et la branche dont les annotations collent le mieux à ce profil ([PAS], *Encounter Selection*). Le choix d'acteur se fait au dernier moment, comme dans [ASD].
- **Effet mesuré.** Étude utilisateurs, version adaptative contre version fixe ([PAS], *Evaluation*, tableau 1) :
  - sur tous les participants, aucune des deux hypothèses (plus de plaisir, plus d'agentivité) n'est fortement soutenue (74 % et 71 % de confiance) ;
  - seul un sous-groupe (femmes ayant trouvé le jeu facile à suivre) les soutient, à 93 % et 86 % de confiance.
- **Transposition [inférence] : faible pour la V2.** L'idée transposable est légère : la saisie révèle ce que l'utilisateur cherche (combat, relation, mystère), et le Directeur peut en tenir compte dans sa sélection. Un vrai modèle de joueur est un chantier à part.

### D7. Choisir parmi des actions candidates selon des critères narratifs (IDtension)

- **Principe.** Le récit est une structure *atemporelle* de buts, tâches, obstacles et valeurs éthiques, non rattachée à un personnage. Les actions candidates sont évaluées selon « *a set of narrative criteria* ». Certains relèvent de la rationalité de l'agent (« *ethical consistence, motivational consistence* »), d'autres du récit, « *such as "conflict"* », à travers un modèle de la perception du joueur ([IDT], *Behind the stage*).
- **Effet mesuré.** Aucun dans la démo. L'auteur note un cadre jugé rigide par les scénaristes.
- **Transposition [inférence].** IDtension sépare la **génération** des possibles de leur **sélection** selon des critères explicites, dont le conflit. C'est exactement la position du Directeur : les agents d'analyse génèrent, il sélectionne. Ses critères de sélection peuvent être nommés : cohérence avec les motivations, potentiel de conflit, pertinence pour la saisie.

---

## 3. Travaux à base de LLM (2024-2026)

### L1. IBSEN : instruire sans donner la réplique

- **Architecture.** Un directeur écrit un plan de suite qui respecte l'objectif d'intrigue courant, le traduit en script (ordre de parole et répliques attendues), instruit les acteurs, puis vérifie si l'objectif est atteint ([IBSEN] §3.1).
- **Forme de la sortie : l'instruction.** « *Providing the original script turn […] to the actor agent often encourages the actor to directly take u = u^ as the output unchanged* ». À l'inverse, laisser l'acteur seul fait dériver l'intrigue. Le compromis est une instruction faite du plan, d'un **synopsis** de la réplique et de **mots-clés** de jeu (§3.1.2).
- **Joueur.** Toute action du joueur qui n'accomplit pas l'objectif fait regénérer le plan et le script (§3.3).
- **Mesures** (GPT-3.5, 10 pièces, 785 tours ; §4.2, tableau 1) :
  - la détection d'objectif atteint par le directeur a une précision de 0,82, un rappel de 0,72 et un F1 de 0,77 ;
  - les échecs viennent d'un LLM « *overly fixated on the wording of the objective* » ;
  - un objectif non atteint après 9 tours est **forcé**, ce qui est arrivé 11 fois sur 218 vérifications ;
  - la répétition reste élevée malgré un filtre de distance de Levenshtein.
- **Coût.** Directeur (plan, script, vérification) plus un appel par acteur et par tour.
- **Transposition [inférence].** C'est la preuve la plus directe du risque déjà observé avec `<resolution>` : **un texte cible trop précis est recopié**. Le Directeur ne doit transmettre au Narrateur ni prose ni réplique, seulement des intentions, des contraintes et des mots-clés. La « complétion forcée » est l'anti-modèle à éviter.

### L2. Wu et al. 2025 : motivations par acteur et réflexion bornée

- **Architecture directeur-acteurs.** À chaque moment, le directeur génère pour un acteur une **motivation** z_t. L'acteur n'a pas accès au script : il décide à partir de son profil et de cette motivation ([WU25] §4.3).
- **Réflexion sur l'intrigue.** Tous les k = 5 moments, le directeur adapte la chaîne d'objectifs d'intrigue au comportement du joueur (émotion, intention) (§4.2). Cette réflexion est **bornée** : « *no more than one incomplete plot or insert no more than one new plot* ». Raison donnée : « *the LLM is inclined to adjust the current plots to a greater extent, thus introducing plots that are incoherent or unrelated* ».
- **Effets mesurés** (6 annotateurs, 60 parties, notes de 1 à 5 ; §5.2, tableau 4) :
  - la réflexion augmente l'agentivité (influence du joueur 3,5 → 4,0 ; suivi de l'intention 3,3 → 4,0), l'attrait des personnages (3,5 → 3,9) et la progression (3,9 → 4,3) ;
  - l'architecture directeur-acteurs donne des personnages plus attirants, mais une progression plus faible (4,3 → 3,6) : « *the communication between director and actor agents inevitably results in information loss* ».
- **Génération du script (§5.1, tableau 3).** Imposer des techniques de dramaturgie (situations dramatiques, suspense, retournement, non-linéarité) avec une boucle critique-révision bat le simple « plan d'abord » : suspense 10 % → 32 %, tension émotionnelle 10 % → 48 % de « meilleur ».
- **Coût.** Un appel directeur par moment, plus un appel par acteur ; la réflexion s'ajoute tous les k moments.
- **Transposition [inférence].**
  - **Borner** la production du Directeur : au plus un ou deux nudges par tour.
  - **Ne pas reformuler** ce que disent les agents : transmettre leur détail tel quel, ce qui est déjà prévu.
  - Le gain d'agentivité vient d'une direction qui **suit l'intention du joueur**, pas d'une direction qui la contrarie.

### L3. Dramamancer : storylets déclenchés et relance

- **Principe.** Un *storylet* associe une condition en langage naturel, une **instruction** en langage naturel et des effets éventuels (entrée ou sortie d'un personnage, changement de scène, acte suivant) ([DM26], I3D, §1). Quand le LLM juge la condition remplie, l'instruction est **insérée dans son contexte**.
- **Relance.** Des storylets de **repli** (*fallback*) se déclenchent après un nombre fixe de tours sans déclenchement, « *to keep the story moving forward* » (figure 2).
- **Deux modules, un appel LLM chacun** ([DM26], arXiv, §3) :
  - un module d'**interprétation** décide, après chaque saisie, quelles conditions sont remplies ;
  - un module d'**instanciation** écrit la ligne suivante et reçoit l'issue (*outcome*) des storylets déclenchés, avec la consigne de l'intégrer « *organically* », éventuellement sur plusieurs lignes, tout en restant « *highly responsive to the most recent input* ».
- **Effet mesuré.** Aucun. Les critères proposés (§4) sont, côté joueur, *responsiveness*, *timing*, *reflection* et *engagement*.
- **Transposition [inférence].**
  - Le découpage interprétation / instanciation correspond au découpage Directeur / Narrateur.
  - La **relance après N tours sans progression** est un nudge simple et utile.
  - La consigne « intégrer organiquement, éventuellement sur plusieurs tours » est le bon contrat pour le Narrateur : un nudge n'a pas à être soldé dans le tour.
  - Dramamancer reçoit en revanche des issues écrites par un auteur humain. Choral-writer n'a pas d'auteur de scénario, et c'est l'issue qui est à éviter.

### L4. SWAG : un menu d'actions abstraites choisi par un LLM

- **Principe.** Un LLM « discriminateur d'actions » choisit, à chaque paragraphe, une action dans une liste fermée. Un autre LLM écrit le paragraphe suivant à partir de cette action ([SWAG] §3.4).
- **Forme de la sortie : une seule action abstraite.** La liste en compte 30 (annexe B), dont « *add suspense* », « *add conflict* », « *add plot twist* », « *add foreshadowing* », « *add a cliffhanger* », « *add a moral dilemma* », « *add an antagonist* » et « *add setting details* ».
- **Effet mesuré** (évaluation humaine par paires sur l'intérêt, la **surprise** et la cohérence ; §4.6, figures 5 à 8) :
  - SWAG bat la génération de bout en bout, y compris avec GPT-3.5 et GPT-4 comme discriminateur ;
  - un discriminateur entraîné bat un choix **aléatoire** dans la même liste.
- **Biais.** Pendant la collecte, GPT-4 choisissait « *add suspense* » bien plus que les autres actions, « *an inherent bias while selecting actions* ». Les auteurs ont dû régénérer des données sans cette option pour étaler la distribution (§3.1, figures 2 et 3).
- **Coût.** +1 appel court par segment.
- **Transposition [inférence].**
  - Des nudges **typés et abstraits** donnent un gain mesuré en surprise et en intérêt, et le choix compte (il bat le hasard).
  - Un LLM laissé libre de choisir **s'effondre sur une action dominante**. Il faut donc une contrainte de diversité, par exemple ne pas répéter le même type deux tours de suite, avec l'historique des nudges récents dans le contexte du Directeur.

### L5. HAMLET : planificateur, détecteur, relanceur

- **Architecture.** Un plan hors ligne fixe des points d'intrigue, chacun clos par un *flag* (une action, une réplique ou un résultat concret). En ligne, trois agents se partagent la direction ([HAM], figure 1, tableaux 18 à 20) :
  - un *Planner* trace le chemin entre points et empêche les acteurs de sauter des étapes ;
  - un *Transfer* détecte qu'un flag est atteint ;
  - un *Advancer* donne des instructions directes quand l'histoire stagne.
- **Arbitre du monde.** Un *narrator* juge la faisabilité des actions physiques.
- **Transposition [inférence].** HAMLET sépare détection et relance comme Dramamancer. Il reste « *strong story* » : les flags sont des issues prédéfinies. Seule l'idée de l'*Advancer* (intervenir seulement en cas de stagnation) est à retenir.

### L6. Clerc et al. 2026 : mesurer l'agentivité et le contrôle

- **Principe.** Trois gestionnaires hybrides LLM et symboliques partagent un même modèle du monde, avec des opérations à préconditions et effets ([CL26] §4) :
  - *open* : injection d'événements aléatoire, avec une probabilité p_evt ou en l'absence de commande ;
  - *mcts* : réparation par recherche arborescente en cas d'impasse ;
  - *ma* : PNJ autonomes.
- **Indicateurs (§5, *Evaluation Framework*).**
  - Agentivité : taux d'**acceptation**, la part des propositions du joueur appliquées sans changement.
  - Contrôlabilité : taux d'événements et taux de **préemption**, la part des propositions du joueur remplacées par un événement.
  - Intention d'auteur : passage par les îlots.
  - Robustesse.
- **Mesures** (100 sessions par gestionnaire ; §6, tableau 1) :

  | Propriété | *open* | *mcts* | *ma* |
  |---|---|---|---|
  | Agentivité | 0,44 | 0,27 | 0,68 |
  | Contrôlabilité | 0,28 | 0,40 | 0,52 |
  | Intention d'auteur | 0,47 | 0,44 | 0,04 |
  | Robustesse | 0,58 | 0,76 | 0,63 |

  La réparation « *takes over the event channel* » dans les impasses et réduit d'autant les tours menés par le joueur. Les auteurs concluent qu'aucun gestionnaire n'est idéal.
- **Transposition [inférence].**
  - Le compromis est réel : plus le Directeur corrige, moins le joueur pilote.
  - Les taux d'acceptation et de préemption sont des indicateurs simples pour le **mode Debug** : part des tours où le Directeur a émis un nudge, part des tentatives du protagoniste dont l'issue a été infléchie.

### Autres travaux (lecture partielle)

- **Open-Theatre** remplace les acteurs individuels par un « acteur global » piloté par le directeur, pour la cohérence ([OT25] §4).
- **Wu et al. 2024** (*From Role-Play to Drama-Interaction*) utilisent des stratégies de réponse pour ramener le joueur vers l'intrigue **[non vérifié]**, connues seulement par [WU25] §4.1.

Ces deux travaux vont vers plus de contrôle central, à l'opposé du choix de Choral-writer.

---

## 4. Ce qui ouvre une scène, ce qui la referme

Synthèse des sources ci-dessus **[inférence]**, croisée avec les résultats de `planification-et-creativite` : le plan nu aplatit, les points de bascule tendent.

| Forme | Exemples sources | Effet attendu | Verdict |
|---|---|---|---|
| Fixer l'issue d'un événement | *cause* (D1), flags (L5), complétion forcée (L1), `<resolution>` | Ferme : le Narrateur rend un fait acquis | À éviter |
| Donner un texte cible (réplique, prose) | script d'IBSEN (L1) | Ferme : le texte est recopié | À éviter |
| Replanifier sans limite | réflexion non bornée (L2) | Incohérence, dérive | À borner |
| Rendre saillant (indice, piste, détail) | *hint* (D1), relance IDA (D4) | Ouvre : augmente une probabilité | À garder |
| Différer (révélation, issue) | *temp_deny* (D1), proscriptive (D3) | Tend : le suspense tient | À garder, outil principal |
| Interdire une résolution ce tour | proscriptive (D3) | Ouvre tout le reste | À garder |
| Viser un changement de valeur | beat et courbe de tension (D2) | Tend sans écrire le « quoi » | À garder |
| Complication sur l'issue d'une tentative | intervention (M11), revers (Tian) | Surprend, dans les limites de la règle protagoniste | À garder, avec parcimonie |
| Événement du monde ou du hors champ | causer par PNJ (D1), monde invisible (D5) | Surprend, à faible coût de cohérence | À garder |
| Relance après stagnation | *fallback* (L3), *Advancer* (L5) | Évite l'enlisement | À garder, conditionnel |
| Ne rien faire | « *choose not to act* » (D1) | Laisse le joueur seul maître | Option explicite |

---

## 5. Coordination avec les agents-personnages

Règles tirées des sources, transposées **[inférence]** :

1. **Le personnage incarné fait autorité sur lui-même.** Le Directeur ne fonde un nudge impliquant ce personnage que sur sa contribution ([TH10] : filtre de cohérence des motivations ; [ASD] : le personnage choisit comment réaliser).
2. **Un refus devient un obstacle, jamais une exception.** Si l'agent dit que son personnage refuse, le Directeur peut faire de ce refus le moteur de la scène : conflit, tentative contrariée. Il ne peut pas l'annuler. C'est le « *conflict* » d'IDtension ([IDT]).
3. **Le monde non observé est libre.** Lieux, faits hors champ, personnages non incarnés, dans les limites de ce que l'utilisateur a déjà vu ([TH10] §3.2 ; M8).
4. **Le protagoniste a le droit exclusif de défaire le récit** ([ASD] §2.4). Le Directeur peut infléchir l'issue de ses tentatives, jamais ses actes ni ses paroles.
5. **Transmettre, ne pas résumer.** Le passage par un directeur perd de l'information ([WU25] §5.2). Le Directeur transmet le détail des contributions retenues et ajoute ses nudges à part.

---

## 6. Transposition : la sortie du Directeur

Proposition **[inférence]**, à discuter dans #8.

**Coût.** +1 appel LLM non streamé par tour, entre l'analyse et le Narrateur. Il s'ajoute au délai avant le premier mot de prose. La phase étant facultative, on peut l'activer selon des règles, comme M5. La sortie est courte, donc l'appel peut être rapide.

**Forme : une enveloppe structurée en deux parties.**

```jsonc
{
  "selection": [
    // références aux items du whiteboard retenus ; leur détail est transmis tel quel
    { "agent": "<id>", "item": "<index>", "why": "<raison courte, pour le mode Debug>" }
  ],
  "dropped": [ { "agent": "<id>", "item": "<index>", "why": "<raison>" } ],
  "tension": "monter | tenir | relacher | basculer",   // cible de tension du tour (D2)
  "nudges": [                                          // 0 à 2 (L2 : borner)
    {
      "type": "<voir liste>",
      "target": "<élément du récit visé>",
      "basis": ["<agent>/<item>"],   // obligatoire si le nudge implique un personnage incarné (§5.1)
      "note": "<intention, pas texte : une pression, pas une issue>"
    }
  ]
}
```

**Types de nudges proposés, du plus léger au plus fort** (classés par *manipulativity*, D1) :

| Type | Origine | Ce que le Narrateur en fait |
|---|---|---|
| `saillance` | *hint* (D1) | rendre un détail, une piste ou une présence plus visible, sans en tirer de conséquence |
| `retard` | *temp_deny* (D1) | ne pas résoudre ou ne pas révéler tel point ce tour ; laisser la question ouverte |
| `interdit` | proscriptive (D3) | éviter tel état (une résolution, une révélation, une sortie de scène) |
| `pression` | prescriptive abstraite (D3), motivation (L2) | mettre au premier plan l'intention d'un PNJ, issue de sa contribution |
| `evenement` | causer par le monde (D1), hors champ (D5) | introduire un fait extérieur, sans en fixer les suites |
| `complication` | intervention (M11), revers (Tian) | contrarier l'*issue* d'une tentative du protagoniste (jamais l'acte) |
| `relance` | *fallback* (L3), *Advancer* (L5) | seulement après N tours sans progression : donner prise au joueur |

**Contrat du Narrateur.**

- Les nudges sont des **pressions à intégrer organiquement**, éventuellement sur plusieurs tours (L3), et non des faits à constater.
- La prose reste **d'abord une réponse à la saisie** (L3, L2).
- Aucun nudge ne contient de texte à reproduire (L1).

**Garde-fous.**

- Au plus deux nudges par tour, souvent zéro ou un (L2).
- Historique des derniers nudges dans le contexte du Directeur, et interdiction de répéter le même type deux tours de suite (L4).
- `relance` seulement après stagnation (L3).
- Pas de type « issue ».

**Mode Debug.** Les champs `why` et `basis`, plus deux taux par récit (L6) : part des tours avec au moins un nudge, et part des tentatives du protagoniste infléchies par `complication`.

---

## 7. Recommandation classée

1. **Des nudges typés, bornés et sans issue** (D1, D3, L2, L4). C'est la forme la mieux étayée : un vocabulaire fermé d'actions abstraites, à faible manipulativité, deux au plus par tour, avec une contrainte de diversité. Elle répond directement à l'échec de `<resolution>`. À décider : la liste exacte des types et la borne.
2. **La sélection avec transmission intégrale du détail** (L2, D7). Le Directeur choisit selon des critères nommés (pertinence pour la saisie, potentiel de conflit, cohérence des motivations) et ne reformule pas. À décider : les critères, et si les items écartés restent visibles du Narrateur.
3. **Une cible de tension par tour** (D2, Tian et al.). Un seul champ, peu coûteux, qui donne une direction sans « quoi ». À décider : faut-il une mémoire de courbe sur plusieurs tours, par exemple une entrée mémoire « tension récente » ?
4. **L'autorité des personnages inscrite dans le format** (D5, D3). Un champ `basis` obligatoire pour tout nudge qui implique un personnage incarné, et une règle « refus = obstacle ». À décider : que fait le Directeur quand deux agents-personnages se contredisent ?
5. **Une relance conditionnelle** (L3, L5, D4). Elle ne s'active qu'après N tours sans progression. À décider : qui mesure la stagnation (le Directeur seul, ou un compteur en mémoire) ?
6. **L'instrumentation Debug** (L6). Taux de nudges et taux d'issues infléchies, plus les justifications. Peu coûteux, et c'est ce qui permettra de régler les bornes.

**À éviter.**

- Une sortie qui **fixe l'issue** (*cause*, flags, complétion forcée, `<resolution>`).
- Une sortie qui contient de la **prose ou des répliques** (L1).
- Une replanification **non bornée** (L2).
- Un menu ouvert sans contrainte de diversité, qui converge vers « ajouter du suspense » (L4).
- Les **interdits permanents** : préférer des retards réversibles (D1).
- Un directeur qui **résume** les contributions au lieu de les transmettre (L2).
- Tout nudge qui **réécrit** un acte ou une parole du protagoniste, ou qui **annule** le refus d'un personnage incarné.
- Pour la V2, un modèle du joueur (D6) et une simulation préemptive (D4) : gains faibles ou non mesurés, coût réel.

---

## 8. Limites

- **Aucune étude lue ne mesure la surprise produite par un *nudge* comparé à une issue imposée, à architecture égale.** Le gain de SWAG en surprise vient d'un menu d'actions contre une génération libre, pas contre un plan d'issue. L'hypothèse centrale reste donc une **[inférence]** à tester : nudges contre `<resolution>` sur les mêmes tours.
- Les systèmes fondateurs (DODM, ASD, Thespian, IDA) sont évalués sur des joueurs **simulés** ou pas évalués du tout du point de vue de l'expérience. PaSSAGE est la seule étude utilisateurs, et ses effets sont faibles.
- Les évaluations LLM (IBSEN, SWAG) utilisent en partie des juges LLM. Wu et al. et SWAG ont aussi des annotateurs humains, en petit nombre.
- Le modèle complet d'IDtension (Szilas 2007), la thèse de Weyhrauch (1997) et Bates (1992) n'ont pas été lus dans le texte d'origine.
- Les études de game master LLM (par exemple *Static vs. Agentic Game Master AI*, arXiv:2502.19519) n'ont pas été lues.
