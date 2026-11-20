# Mécanismes narratifs : PNJ autonomes, simulation hors champ, résistance à l'utilisateur

Recherche pour le ticket #5 (carte #2, « Wayfinder : Choral-writer V2 »). Elle prépare les tickets de discussion #8 (résistance à l'utilisateur) et #9 (simulation hors champ). Le cycle de vie des mémoires reste hors périmètre.

**Question.** Quels mécanismes de la littérature peut-on transposer au pipeline actuel (agents d'analyse en parallèle, puis whiteboard, puis Narrateur) pour :

1. donner aux personnages des objectifs propres et une évolution hors champ ;
2. faire avancer le monde sans l'utilisateur (à quel moment, à quel coût) ;
3. contester ou infléchir une saisie incohérente au lieu de l'accepter telle quelle ?

Conventions :

- **N** = nombre de personnages concernés.
- Un « appel » est un appel LLM supplémentaire par tour, au-delà du pipeline actuel.
- **[non vérifié]** marque ce que je n'ai pas pu confirmer dans le texte intégral de la source.
- **[inférence]** marque une transposition que je propose et que la source n'affirme pas.

---

## 1. Le pipeline actuel (vérifié dans le code)

| Élément | Comportement actuel | Fichier |
|---|---|---|
| Analyse | 0 à N agents `phase: 'analysis'` lancés en parallèle (`Promise.allSettled`). Chacun reçoit le prompt système du projet, ses instructions, un contrat de sortie, sa vue mémoire, l'historique (20 tours au plus) et la saisie. Il rend une enveloppe `{v, agent, summary, items[{kind, text, importance: LOW/NORMAL/HIGH}]}`, où `kind` est libre. Le budget d'items vaut `max(3, floor(12/N))`. Un agent en échec LLM est ignoré et les autres continuent. | `apps/api/src/modules/chat/services/analysisService.ts` |
| Whiteboard | La liste des enveloppes validées, sérialisée en JSON dans le prompt du Narrateur. Aucun agent d'analyse ne voit les sorties des autres pendant le tour. | `chatService.ts`, `narratorService.ts` |
| Narrateur | Un seul appel en streaming qui doit produire `<resolution>…</resolution>` puis `<prose>…</prose>`. Seule la prose est diffusée à l'utilisateur. | `narratorService.ts`, `narratorParser.ts` |
| Gardien | Après la narration, il reçoit `resolution` et `prose` et propose des mutations de mémoire, qu'un réducteur valide. | `chatService.ts` (`context.memory.process`) |
| Mémoire | Des entrées étiquetées. Chaque agent lit `none`, `all` ou un ensemble de tags (`memoryRead`). Le prompt présente déjà la mémoire comme « *facts, viewpoints and objectives* ». | `apps/api/src/modules/memories/services/memoryState.ts` |
| Déclenchement | Un tour ne part que d'une saisie utilisateur (`send`, `retry` ou `regenerate`). Rien ne s'exécute entre deux tours. | `prepareTurn.ts` |

Points d'ancrage utiles pour la suite :

- La section `<resolution>` est déjà l'endroit où le Narrateur **décide** de ce qui se passe avant d'écrire. C'est le point naturel pour arbitrer une saisie.
- Le `kind` libre des items permet de prototyper des signaux typés (« verdict », « intention », « événement hors champ ») sans changer le schéma.
- Les tags mémoire et `memoryRead` permettent déjà de donner une vue partielle par agent.

---

## 2. Sources consultées

| Réf. | Source | Statut de lecture |
|---|---|---|
| [GA] | Park et al., *Generative Agents: Interactive Simulacra of Human Behavior*, UIST 2023, arXiv:2304.03442 (DOI 10.1145/3586183.3606763) | Texte intégral (PDF arXiv) |
| [AR] | Huot et al. (Google DeepMind), *Agents' Room: Narrative Generation through Multi-step Collaboration*, ICLR 2025 | Texte intégral (PDF des actes) |
| [SW] | Xia et al., *StoryWriter: A Multi-Agent Framework for Long Story Generation*, arXiv:2506.16445v1 | Texte intégral (PDF arXiv) |
| [FW] | Farrell & Ware, *Large Language Models as Narrative Planning Search Guides*, IEEE Transactions on Games 17(2), juin 2025, p. 419-428, DOI 10.1109/TG.2024.3487416 | Texte intégral (PDF hébergé par S. G. Ware) |
| [MEM] | Landwehr, Varis Doggett, Weber, *Memories for Virtual AI Characters*, INLG 2023 | Texte intégral (ACL Anthology) |
| [ST] | SillyTavern, *World Info*, https://docs.sillytavern.app/usage/core-concepts/worldinfo | Page de documentation |
| [SV] | Wang, Zhou, Ledo (Autodesk Research), *StoryVerse: Towards Co-authoring Dynamic Plot with LLM-based Character Simulation via Narrative Planning*, FDG 2024, arXiv:2405.13042v2 | Texte intégral (PDF arXiv). Piste suivie depuis [GA] et [FW]. |
| [ASD] | Riedl, Stern, Dini, Alderman, *Dynamic Experience Management in Virtual Worlds for Entertainment, Education, and Training*, ITSSA 2008 (préprint) | Texte intégral (PDF hébergé par S. G. Ware). Piste suivie depuis [FW]. |
| [MED] | Riedl, Saretto, Young, *Managing Interaction Between Users and Agents in a Multi-agent Storytelling Environment*, AAMAS 2003, p. 741-748 | **[non vérifié]** : texte intégral non consulté. La distinction intervention / accommodation est connue par des résumés secondaires (résultats de recherche AAAI/AIIDE). |
| [RY] | Robertson & Young, *Modelling Character Knowledge in Plan-Based Interactive Narrative to Extend Accommodative Mediation*, AIIDE | **[non vérifié]** : page bloquée par un anti-robot. Seuls le titre et un résumé secondaire ont été lus (« replanifier les événements que l'utilisateur n'a pas observés »). |

---

## 3. Mécanismes

Chaque fiche donne le principe, la source, le coût et l'adéquation (où le mécanisme s'insère et ce qu'il exige de nouveau).

### Axe 1 : des personnages qui ont leurs propres objectifs

#### M1. Intention explicite par personnage (objectif et plan courant)

- **Principe.** Chaque personnage porte un résumé de ses objectifs et un plan à gros grain, stockés comme mémoire et relus pour décider de ses réactions. [GA] §4.3 : les plans sont enregistrés dans le *memory stream*, décomposés récursivement (journée, puis heures, puis tranches de 5 à 15 minutes) et peuvent changer en cours de route. À chaque observation, un prompt décide de « continuer le plan ou réagir » (§4.3.1). Côté planification symbolique, [FW] §II (formalisme de Sabre) donne aux personnages des objectifs et des croyances : une action n'est acceptable que si elle sert un objectif du personnage selon ses croyances.
- **Coût.**
  - 0 appel si l'intention est maintenue par le Gardien à partir de la `resolution` (une mutation mémoire de plus).
  - +1 appel par personnage seulement si l'on ajoute une étape dédiée de replanification.
- **Adéquation : forte.**
  - Où : des entrées mémoire étiquetées par personnage (par exemple un tag `perso:<nom>` et une clé `intention`), lues par l'agent qui incarne ce personnage, ou par l'agent « personnages absents ».
  - Ce qui est nouveau : une convention de clé et de tag, et une consigne au Gardien pour mettre à jour l'intention quand la `resolution` la fait avancer ou échouer. La mémoire se décrit déjà comme contenant des « objectives ».
  - Prérequis pour M10 et M11 : sans objectif explicite, on ne peut pas juger qu'une saisie trahit un personnage.

#### M2. Connaissance subjective : ce que le personnage sait

- **Principe.**
  - [MEM] §3.3 : la mémoire d'un personnage se compose de plusieurs *knowledge sources* interrogées séparément. §3.4 et §3.8 : un souvenir oublié (rétention R = 0) ne doit **jamais** remonter, quels que soient les autres facteurs.
  - [FW] §II : dans Sabre, chaque action a une *observation function* qui indique quels personnages en ont connaissance.
  - [SV] §2.3 : la vérification de motivation se fait à partir de l'état du monde, « *including the character's memory* ».
- **Coût.** 0 appel (filtrage). Le seul coût est une consigne de plus au Gardien : noter qui a observé chaque événement.
- **Adéquation : forte, mais c'est surtout un contrat de données.**
  - Où : les tags mémoire et `memoryRead` par agent existent déjà.
  - Ce qui est nouveau : une convention « témoin » (qui sait quoi). C'est exactement le point « mémoire minimale des personnages » de la carte #2 (« strictement ce dont la simulation hors champ a besoin »). C'est le minimum pour qu'un PNJ ne réagisse pas à ce qu'il ne peut pas savoir.

#### M3. Réflexion périodique déclenchée par un seuil d'importance

- **Principe.** [GA] §4.2 :
  - Une synthèse de haut niveau est produite quand la somme des importances des derniers événements perçus dépasse un seuil (150 dans leur implémentation), soit environ deux à trois fois par jour simulé.
  - L'agent génère d'abord des questions saillantes, puis des *insights* qui citent les souvenirs sources.
  - L'ablation (§6.5) montre que la réflexion contribue à la crédibilité. Par exemple, §6.5.3 : sans réflexion, l'agent ne sait pas synthétiser ce qu'aime un autre personnage.
- **Coût.** 1 à 2 appels par personnage et par déclenchement. Ce coût est amorti, pas payé à chaque tour.
- **Adéquation : moyenne.**
  - Où : l'importance existe déjà dans les enveloppes (LOW, NORMAL, HIGH), donc un compteur pondéré par personnage est faisable sans appel.
  - Ce qui est nouveau : un **déclencheur** hors du chemin principal (étape après le Gardien, ou tâche asynchrone) et l'écriture des synthèses en mémoire.
  - Ce mécanisme touche le cycle de vie des mémoires, qui est hors périmètre. À garder pour plus tard.

#### M4. Agents spécialisés et tableau partagé étiqueté (déjà en place)

- **Principe.** [AR] §3 : des agents spécialisés écrivent sur un *scratchpad* partagé, étiqueté par agent, et un orchestrateur choisit l'agent suivant et décide « *whether calling on each agent is necessary* ». §4.1 : orchestrateur déterministe (conflit, personnage, cadre, intrigue, puis rédaction en cinq actes). §7 : les variantes avec agents de rédaction sont préférées aux références. La variante « planification seule » déçoit parce que son unique *finalizer* est « *too simplistic to make good use of the planned elements* ».
- **Leçon transposable [inférence].** Le pipeline actuel est déjà un Agents' Room parallèle, avec une différence : les agents ne se lisent pas entre eux pendant un tour. La remarque sur le *finalizer* s'applique au Narrateur : enrichir le whiteboard ne sert que si le Narrateur a des consignes explicites pour arbitrer les contributions. Cela rejoint M11.
- **Coût.** N appels parallèles par tour (aujourd'hui, un par agent d'analyse). La latence vaut celle de l'agent le plus lent.
- **Adéquation : déjà là.** Deux modes de modélisation sont possibles : un agent par personnage important, ou un agent collectif « personnages absents ». Le choix relève de #9.

### Axe 2 : un monde qui avance sans l'utilisateur

#### M5. Activation conditionnelle des agents (règles à la World Info)

- **Principe.** [ST] : une entrée de lorebook n'est injectée que si ses clés apparaissent dans les derniers messages (*Scan Depth*). Elle peut aussi être constante (*Constant*). Elle dispose de :
  - une probabilité (*Trigger %*) ;
  - des effets temporels en messages : *Sticky* (reste active N messages), *Cooldown* (inactivable N messages après déclenchement), *Delay* (pas avant N messages) ;
  - des groupes d'inclusion (une seule entrée gagnante par groupe) ;
  - un budget de jetons ;
  - un filtre par personnage.

  [AR] §3 prévoit aussi que l'orchestrateur décide si un agent est nécessaire.
- **Transposition [inférence].** Appliquer ces règles **aux agents d'analyse** plutôt qu'à du texte : l'agent « Varek (hors champ) » ne tourne que si « Varek » ou « la guilde » apparaissent dans les K derniers messages, ou tous les M tours (*cooldown*), ou avec une probabilité p (agent du chaos).
- **Coût.** 0 appel pour la décision, qui est déterministe. Le mécanisme **économise** des appels en n'exécutant pas tous les agents à chaque tour.
- **Adéquation : forte et peu risquée.**
  - Où : un filtre dans `chatService.run` avant `analyze()`. Le filtre actuel `isAnalysisAgent` devient « est un agent d'analyse **et** est actif pour ce tour ».
  - Ce qui est nouveau : une règle d'activation par affectation d'agent au projet, l'état des compteurs (dérivable de l'historique des tours, sans stockage dédié) et l'affichage « agent non déclenché » dans l'observabilité.

#### M6. Tic de simulation hors champ : où le placer dans le temps

- **Principe.**
  - [GA] simule en continu : boucle perception, planification, action à chaque pas de temps (§3, §4.3.1). Le coût est le contre-argument documenté. §8.2 : simuler 25 agents pendant deux jours a coûté « *thousands of dollars in token credits* » et pris plusieurs jours.
  - [SV] §2.1 et §2.3 : à chaque pas de temps, soit un acte prêt est exécuté par l'*Act Director*, soit le *Character Simulator* fait agir chaque personnage. Les auteurs signalent que « *the frequent call to LLMs also raises concerns about delays* » (§4).
  - [MEM] §5 note la limite inverse : des personnages « *purely reactive to user input* » ; l'initiative reste un travail futur.
- **Options pour Choral-writer [inférence] :**

  | Option | Moment | Coût par tour | Latence perçue | Remarque |
  |---|---|---|---|---|
  | A. Dans l'analyse (état actuel) | Avant la narration, en parallèle | +1 (ou +N) | ≈ 0 de plus (parallèle) | Simple. Mais l'agent hors champ « rapporte » au Narrateur, qui a tendance à l'insérer dans la scène. Il faut un `kind` dédié (par exemple `offscreen`) et une consigne : « ne pas montrer, sauf si cela fuit dans la scène ». |
  | B. Après le tour (post-Gardien) | Après la prose, pendant que l'utilisateur lit | +1 (ou +N) | 0 (hors chemin critique) | Le hors champ alimente la mémoire (intentions, événements) pour le tour suivant. Il demande une nouvelle étape après le Gardien ou une tâche différée, et une gestion d'erreur indépendante du tour. |
  | C. Sur saut temporel | Quand la saisie ou la `resolution` signale du temps écoulé (« trois jours plus tard ») | +1 par saut | Ponctuelle | Fait avancer le monde proportionnellement au temps du récit, pas au nombre de tours. Il faut détecter le saut (item de l'analyse ou balise de la résolution). |
  | D. Paresseuse (voir M8) | Au moment où un élément hors champ redevient observable | 0 tant que non observé | 0 | La moins chère. Le hors champ n'est « calculé » qu'à la demande. |

- **Adéquation.** A existe déjà. B et C demandent un nouveau point d'exécution dans le cycle de tour. D est une politique, sans infrastructure. Recommandation : combiner D (par défaut), A (déclenché par M5) et C (sauts de temps). B n'est utile que si l'on veut de l'évolution hors champ **sans** saisie, ce qui n'existe pas aujourd'hui.

#### M7. Actes abstraits : prérequis, objectifs et emplacements à résoudre

- **Principe.** [SV] §2.2 et §2.3 : l'auteur écrit des « actes abstraits ». Chacun a un objectif narratif, des prérequis (état du monde ou action du joueur, évalués par LLM ou par le moteur) et des *placeholders* résolus plus tard, comme des promesses (« X = le personnage accidenté à l'acte 1 »). À chaque pas, un *Act Selector* regarde si un acte a ses prérequis remplis. L'*Act Director* génère alors une séquence d'actions, revue en boucle (voir M12). Les actes ne sont pas séquentiels, ce qui permet des branches. [SW] §2.2 et §2.3 donne un équivalent hors ligne : graphe d'événements validé par un *EventValidator*, puis répartition des sous-événements entre chapitres (*Non-Linear Narration*).
- **Coût.** 1 appel par tour pour évaluer les prérequis (ou 0 si les prérequis sont des mots-clés, comme M5), plus 2 à 2k appels par acte déclenché (génération et revue, k itérations).
- **Adéquation : moyenne à faible pour la V2.**
  - Où : un agent d'analyse « metteur en scène » qui lit une liste d'actes en mémoire et signale sur le whiteboard l'acte à déclencher.
  - Ce qui est nouveau : une structure d'actes rédigée par l'utilisateur, un suivi d'état des actes et des placeholders.
  - C'est le mécanisme le plus riche pour un « monde qui pousse », mais il ajoute un concept (l'acte) que #9 devrait d'abord décider de vouloir.

#### M8. Hors champ révisable tant que rien n'est observé (simulation paresseuse)

- **Principe.**
  - [ASD] §2.3 : le *Automated Story Director* ne répare le plan narratif que quand une action du participant **menace un lien causal**. Les actions qui ne menacent rien sont tenues pour cohérentes.
  - [RY] **[non vérifié]** étend la médiation par accommodation avec un modèle des connaissances : on peut replanifier les événements que l'utilisateur **n'a pas observés**.
- **Transposition [inférence].** Ce qui est hors champ et inconnu de l'utilisateur n'a pas besoin d'être simulé pas à pas. Il suffit d'un état grossier (intention et position probable, M1 et M2). Quand l'élément revient dans la scène, un agent d'analyse décide de ce qui s'est passé, sous contrainte de cohérence avec ce que l'utilisateur a déjà vu.
- **Coût.** 0 tant que non observé. Ensuite, l'appel de l'agent d'analyse concerné, activé par M5 (mots-clés).
- **Adéquation : forte.** Il ne faut rien de nouveau, sinon une consigne dans l'agent hors champ (« décide rétroactivement ce que X a fait depuis sa dernière apparition, sans contredire ce que l'utilisateur a vu ») et la mémoire « témoin » de M2 pour savoir ce que l'utilisateur a vu.

#### M9. Contexte compressé par événement

- **Principe.** [SW] §2.4 (*ReIO, input*) : un *Coordinator* résume l'historique en ne gardant que ce qui concerne le sous-événement courant. Les résumés sont mis en cache. Les auteurs observent une dégradation au-delà d'environ 10 000 caractères d'entrée. L'ablation (§3.2, tableau 2) montre que retirer cette réécriture d'entrée allonge les entrées, augmente le coût et baisse la qualité.
- **Coût.** +1 appel par agent concerné, amorti par le cache.
- **Adéquation : faible pour ce ticket.** C'est surtout une optimisation de contexte pour des agents hors champ nombreux. Elle relève du chantier mémoire, qui est hors périmètre. À noter pour plus tard.

### Axe 3 : contester ou infléchir une saisie incohérente

#### M10. Test de motivation : un PNJ ne fait que ce qu'il a une raison de faire

- **Principe.**
  - [FW] §II (Sabre) : une action est *explained* pour un personnage consentant si elle est l'étape suivante d'un plan qui atteint **ses** objectifs **selon ses croyances**. Une solution ne contient que des actions expliquées.
  - [SV] §2.3, *Character Simulation Evaluation* : pour chaque action d'un plan, un LLM joue le sujet de l'action et répond à la question « la motivation de ce personnage pour faire cela est-elle établie ? ». L'explication sert de retour pour réviser le plan.
  - [FW] §III-V montre qu'un LLM est un bon **proposeur** d'actions plausibles. Mais le contrôle de validité reste confié au planificateur, car « *LLMs are not equipped to handle complex reasoning* » (§III). Ce cadre est dit *LLM-modulo*.
- **Transposition [inférence].** Quand la saisie **dicte** ce que fait ou dit un PNJ (« le garde me laisse passer »), on applique le test de motivation au PNJ concerné, à partir de M1 (objectifs) et M2 (ce qu'il sait). S'il échoue, le PNJ refuse, négocie ou pose une condition, au lieu d'obéir.
- **Coût.**
  - 0 appel de plus si le test est une consigne de l'agent qui incarne déjà le personnage ou de l'agent de cohérence.
  - +1 appel par PNJ dicté si l'on veut un juge dédié.
- **Adéquation : forte.**
  - Où : un agent d'analyse (par personnage, ou un « avocat des PNJ ») émet un item, par exemple `kind: "consentement"`, `importance: HIGH` et un texte « Varek refuse : … ».
  - Ce qui est nouveau : rien dans l'infrastructure, mais des consignes et un `kind` convenu. Cela dépend de M1 et M2 pour fonctionner.

#### M11. Médiation : intervention ou accommodation

- **Principe.**
  - [MED] **[non vérifié en texte intégral]** : face à une action utilisateur « exceptionnelle » (qui défait une condition dont dépend l'intrigue), le système choisit entre deux réponses :
    - **intervention** : l'action échoue ou son effet est altéré dans la fiction ;
    - **accommodation** : l'intrigue est replanifiée pour intégrer l'action.
  - [ASD] §2.3, vérifié : réparation à paliers, du moins au plus destructeur.
    - (i) retirer seulement le lien causal menacé et replanifier ;
    - (ii) retirer aussi les étapes en aval, sauf les « îlots » (étapes imposées par l'auteur) ;
    - (iii) sacrifier aussi les îlots.

    Le calcul se fait hors ligne, en arbre de contingences. Les actions qui ne menacent aucun lien causal passent telles quelles.
- **Transposition [inférence].** Un agent d'analyse « cohérence » classe la saisie et propose une réponse graduée. Le Narrateur l'applique dans `<resolution>`.

  | Verdict | Réponse narrative | Exemple |
  |---|---|---|
  | cohérente | accepter telle quelle | — |
  | accommodable | accepter et ajuster le monde au moindre coût (palier i, puis ii) | « je sors un pistolet » : il était dans le sac |
  | à infléchir (intervention diégétique) | l'intention est respectée, le résultat est altéré par le monde ou un PNJ (M10) | « je saute le gouffre » : il le rate de peu et se rattrape |
  | à contester (hors fiction) | ne pas narrer et signaler l'incohérence à l'utilisateur | contradiction directe d'un fait établi (« mon frère », qui est mort au tour 3) |

  Les îlots de [ASD] correspondent aux faits que l'utilisateur ou l'auteur a déclarés intangibles. Il faut décider (#8) si une telle notion existe.
- **Coût.** 0 appel de plus si un agent de cohérence existe déjà, sinon +1. Le Narrateur ne change pas de nombre d'appels.
- **Adéquation : forte.**
  - Où : un agent d'analyse produit le verdict, et la consigne du Narrateur dit comment appliquer chaque verdict dans `<resolution>`.
  - Ce qui est nouveau : la convention de verdict (`kind`) et, pour la contestation hors fiction, **un nouveau type de sortie de tour** (pas de prose, un message système, ou une prose et un avertissement). C'est la seule option qui touche à l'UI et au contrat de tour.

#### M12. Séparer la décision de la génération

- **Principe.**
  - [MEM] §5 (*Response Routing*) : un prompt conditionnel unique (« si les souvenirs sont pertinents, réponds normalement, sinon fais l'ignorant ») « *has proven unreliable in our tests* ». Les auteurs proposent de décider en amont quelle stratégie de réponse appliquer.
  - [GA] §7.2 : l'*instruction tuning* rend les agents « *overly cooperative* » et polis.
  - [GA] §8.2 : les agents sont vulnérables au *memory hacking*, où une conversation bien construite les convainc qu'un événement passé a eu lieu. C'est exactement le cas d'une saisie qui affirme un fait faux.
- **Transposition [inférence].** Ne pas compter sur le Narrateur seul pour résister : sa pente naturelle est d'accepter. La décision (M10 et M11) doit être prise **avant** par un agent dédié, et le Narrateur doit recevoir une consigne explicite pour faire primer les items de verdict sur la saisie. L'architecture actuelle (analyse, puis Narrateur avec `<resolution>`) est déjà ce découpage. Il manque seulement le contrat entre les deux.
- **Coût.** Le même que M11.
- **Adéquation : forte.** C'est un principe de conception pour #8 plus qu'un composant.

#### M13. Revue et réécriture après génération

- **Principe.**
  - [SW] §2.4 (*ReIO, output*) : le *Coordinator* évalue le texte produit et le réécrit si besoin. Retirer cette étape fait baisser nettement la pertinence (§3.2).
  - [SW] §2.2 : un *EventValidator* critique chaque événement généré.
  - [SV] §2.3 : boucle génération et revue (cohérence globale, exécutabilité, motivation) répétée k fois.
- **Coût.** +1 à 2 appels par itération, plus la latence complète d'une génération.
- **Adéquation : faible.** La prose est diffusée en streaming à l'utilisateur. Une réécriture après coup oblige soit à renoncer au streaming, soit à afficher puis corriger. Il vaut mieux appliquer la revue **avant** la prose, sur l'intention : c'est ce que font M10 et M11 dans l'analyse.

#### M14. Le LLM propose, un modèle symbolique vérifie

- **Principe.** [FW] §I-III : on garde un domaine symbolique écrit à la main (actions STRIPS, préconditions, effets, personnages consentants). Le LLM sert seulement à ordonner la recherche (similarité d'embeddings entre suggestions et actions légales). Résultats (§IV) : sur la plupart des 13 problèmes analysés, la recherche guidée visite davantage de nœuds expliqués et atteint toujours le but plus tôt que la recherche en largeur. Exceptions : des domaines de type « trouver son chemin » (*Secret Agent*, *Space*, *Jailbreak*).
- **Coût.** Élevé en conception (écrire le domaine) et en appels (un par nœud exploré, plafonné à 5 000 nœuds dans l'étude).
- **Adéquation : faible.** Choral-writer est en texte libre, sans domaine d'actions. La seule partie transposable est la philosophie (le LLM propose, un contrôle tranche), déjà couverte par M11 et M12. Une variante légère [inférence] : une courte liste de **faits intangibles** en mémoire, que l'agent de cohérence doit vérifier explicitement.

---

## 4. Synthèse

| # | Mécanisme | Axe | Appels en plus par tour | Nouveauté requise | Adéquation |
|---|---|---|---|---|---|
| M1 | Intention par personnage | 1 | 0 (via Gardien) | convention de clé et tag, consigne Gardien | forte |
| M2 | Connaissance subjective (témoins) | 1 | 0 | convention « qui a vu quoi » | forte |
| M3 | Réflexion à seuil | 1 | ~1 à 2 par perso et par déclenchement | déclencheur hors chemin principal | moyenne (frôle la mémoire) |
| M4 | Agents spécialisés et tableau partagé | 1 | N (existant) | aucune | déjà là |
| M5 | Activation conditionnelle des agents | 2 | **négatif** (économie) | règle d'activation par agent, visibilité dans l'observabilité | forte |
| M6 | Tic hors champ (A, B, C, D) | 2 | 0 à +N selon l'option | B : nouvelle étape après le tour ; C : détection de saut | variable |
| M7 | Actes abstraits | 2 | +1, plus 2k par acte | structure d'actes, suivi d'état | moyenne à faible |
| M8 | Hors champ paresseux | 2 | 0 tant que non observé | consigne et M2 | forte |
| M9 | Contexte compressé par événement | 2 | +1 (en cache) | relève du chantier mémoire | faible ici |
| M10 | Test de motivation du PNJ | 3 | 0 à +1 | `kind` convenu, dépend de M1 et M2 | forte |
| M11 | Intervention ou accommodation graduée | 3 | 0 à +1 | convention de verdict ; sortie de tour « contestation » | forte |
| M12 | Décider avant de générer | 3 | 0 | contrat analyse-Narrateur explicite | forte (principe) |
| M13 | Revue et réécriture de la prose | 3 | +1 à 2, et latence | incompatible avec le streaming | faible |
| M14 | Vérificateur symbolique | 3 | élevé | domaine d'actions | faible |

---

## 5. Recommandation classée

### Pour #8 (résistance à l'utilisateur)

1. **M11 et M12 : verdict gradué produit par l'analyse, appliqué dans `<resolution>`.** Décisions à prendre :
   - les niveaux de verdict (accepter, accommoder, infléchir, contester) ;
   - qui les émet (un agent de cohérence dédié, ou chaque agent) ;
   - la règle de priorité du Narrateur ;
   - le sort d'une **contestation hors fiction** : nouveau type de sortie de tour ou prose et avertissement. C'est le seul point à impact UI et contrat.
2. **M10 : test de motivation des PNJ.** Il ne fonctionne qu'avec M1 et M2. À décider : est-ce le rôle des agents-personnages ou d'un agent « avocat des PNJ » ?
3. **Faits intangibles (variante légère de M14 et îlots de [ASD]).** À décider : la notion existe-t-elle, et qui la déclare ?
4. **À écarter pour la V2 : M13** (réécriture après coup, incompatible avec le streaming).

### Pour #9 (simulation hors champ)

1. **M5 : activation conditionnelle des agents d'analyse** (mots-clés, cooldown, probabilité, toujours actif). C'est le meilleur rapport coût/effet : le coût par tour baisse au lieu de monter, et cela donne le « quand » de la simulation. Décision : le format de la règle, et s'il s'applique à tous les agents ou seulement aux hors champ.
2. **M8, M1 et M2 : hors champ paresseux, appuyé sur l'intention et les témoins.** Le monde n'avance que quand il redevient observable, avec un coût nul sinon. Décision : la mémoire minimale par personnage (intention et « qui sait quoi »), qui recoupe le point ouvert de la carte #2.
3. **M6-C : avance sur saut temporel.** Décision : comment détecter le saut, et qui produit le « résumé du monde » à ce moment.
4. **À reporter :** M6-B (tic après le tour sans saisie), M7 (actes abstraits), M3 (réflexion) et M9 (compression). Ils apportent de nouveaux concepts ou touchent au cycle de vie des mémoires.

---

## 6. Limites de cette recherche

- Pas de chiffres de coût directement comparables. Seul [GA] donne un ordre de grandeur (« des milliers de dollars » pour 25 agents sur deux jours de jeu, §8.2), avec un modèle de 2023. Les coûts ci-dessus sont des **nombres d'appels**, pas des montants.
- [MED] et [RY] n'ont pas été lus en texte intégral. La distinction intervention / accommodation est classique, mais sa formulation exacte reste **[non vérifiée]** ici.
- Aucune source n'évalue la « résistance à l'utilisateur » dans un cadre LLM conversationnel comparable. Les recommandations de l'axe 3 sont des **[inférences]** tirées de la planification narrative et de [MEM] §5 et [GA] §7.2.
