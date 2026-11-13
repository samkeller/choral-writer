
# Choral Writer - Initial Idea
Multi-agent intelligence for long-term storytelling.

## Problématique initiale

La problématique initiale traitée est: `Les llms sont ils destinés à etre des mauvais narrateurs et accompagnateurs de récits ? Sont ils destinés à plaire à l’utilisateur, le suivre trop rapidement et donc à ne jamais réussir à construire des mondes et personnages coherents et riches, "humains" ? Ces questions interviennent à la fois dans spicywriter.com, sillytavern ou tout autre outils et particulièrement sur deepseek qui semble aujourd'hui le meilleur sur la partie narration. Arrivera ton bientôt à un moment ou le prompt d’une histoire peut devenir un véritable jeu sans que le llm tombe dans la facilité ou oublies ?`

## Piste que nous explorons

La piste la plus prometteuse n'est probablement pas un prompt beaucoup plus long. C'est une architecture dans laquelle le LLM devient le moteur d'expression et d'interprétation d'un monde dont l'état est conservé ailleurs.

### Un état du monde qui fait autorité

Le système devrait conserver des données structurées, indépendantes de
la prose générée :
-   où se trouvent les personnages, ce qu'ils font;
-   l'heure, la date et le déroulement des événements;
-   les faits établis et les règles du monde;
-   les relations entre personnages;
-   les promesses, dettes, secrets et engagements encore actifs.

Le modèle pourrait proposer une action ou raconter ses conséquences, mais l'état canonique serait mis à jour dans une couche distincte. Une réponse générée ne devrait pas pouvoir réécrire rétroactivement un fait simplement parce que cela rend la scène plus facile.

Cette séparation est capitale. Si le personnage a perdu une main, le texte ne doit pas pouvoir lui faire utiliser deux mains trois scènes plus tard sans explication. Si une porte a été verrouillée et que personne ne possède la clé, elle ne doit pas être ouverte par commodité narrative.

### Des personnages qui ont une vie hors champ

Un personnage crédible ne devrait pas exister uniquement au moment où le
joueur lui parle.

Il lui faut des objectifs, des contraintes, des informations partielles, des relations, des préférences et des événements qui peuvent évoluer sans intervention du joueur. Il devrait parfois prendre l'initiative, être occupé, refuser une demande, se tromper ou poursuivre un objectif qui entre en conflit avec celui du joueur.

Le travail sur les *Generative Agents* montre une manière de procéder : enregistrer les expériences, produire des réflexions, récupérer les souvenirs pertinents et planifier des actions. Une architecture pourrait aller plus loin en séparant les objectifs de chaque personnage et en faisant évoluer le monde entre deux interventions du joueur.

Il ne s'agit pas de faire tourner une simulation exhaustive de tous les habitants à chaque tour. Des mises à jour périodiques, des événements déclenchés et des agents activés selon leur pertinence peuvent suffire à créer une impression de continuité.

### Une mémoire organisée par nature, pas seulement par similarité

Une mémoire efficace devrait distinguer au moins quatre catégories :

1.  **Canon du monde** : règles, lieux, histoire, géographie, institutions et faits immuables.
2.  **État courant** : positions, possessions, blessures, temps, ressources et situation immédiate.
3.  **Mémoire des personnages** : expériences vécues, connaissances, croyances, émotions, objectifs et relations.
4.  **Journal des événements** : ce qui s'est passé, quand, qui était présent, ce qui a changé et quelles conséquences restent ouvertes.

La recherche vectorielle peut aider à retrouver des passages de conversation, mais elle ne devrait pas être l'unique mécanisme. Un fait critique comme « le personnage ne connaît pas l'identité du meurtrier » doit être conservé comme une donnée explicite, et non dépendre de la capacité d'une recherche sémantique à retrouver une phrase ancienne.

Il faudrait aussi enregistrer les connaissances par personnage. Le narrateur sait ce qui s'est réellement passé ; un personnage ne sait que ce qu'il a vu, appris ou déduit. Cette séparation évite les personnages omniscients et les révélations prématurées.

### Un narrateur qui planifie, mais ne verrouille pas l'histoire

Une histoire interactive ne doit pas nécessairement suivre un scénario rigide. Le système peut conserver des objectifs narratifs souples : une tension qui monte, une dette qui doit produire des conséquences, un secret susceptible d'être découvert, un conflit entre deux personnages.

Mais il doit aussi accepter que le joueur change la trajectoire. Il ne s'agit pas de forcer les événements prévus ; il s'agit de conserver la causalité et de réagir intelligemment à ce qui arrive.

Une architecture utile pourrait séparer les étapes suivantes :

1.  interpréter l'action du joueur
2.  vérifier ce qu'elle est matériellement capable de produire
3.  consulter l'état du monde et les connaissances des personnages concernés
4.  déterminer les réactions plausibles, y compris les refus et les conséquences négatives
5.  mettre à jour l'état canonique
6.  rédiger la scène à partir de ces changements
7.  vérifier que le texte n'introduit pas de contradiction

Le modèle peut rester libre dans la formulation, les dialogues et les détails sensoriels. La liberté de prose n'exige pas la liberté de réécrire les faits.


## Description

Choral Writer est un outil d'intelligence artificielle multi-agent conçu pour la création d'histoires à long terme.

L'idée est simple:
- Créer un environnement d'orchestration ou plusieurs agents interviendront ensemble pour créer des histoires complexes et cohérentes.
- A partir d'un prompt utilisateurs simple, le framework fera participer les agents
- Chaque agent partage une ou plusieurs mémoires 
- Utiliser plusieurs agents d'intelligence artificielle pour collaborer à la création d'histoires complexes et cohérentes sur le long terme.


Il est important que :
- Le nombre d'agents, leurs rôles, leurs limites et droits doivent être configurables, modifiables, editables par l'utilisateur.
- Les mémoires doivent être accessibles et modifiables par les agents selon des règles définies, et permettre un suivi de l'historique des interactions. L'utilisateur/le développeur doit y avoir accès pour vérifier que tout est bon. 
- L'orchestration et le dialogue entre les différents agents doivent être tracables, il doit être possible d'analyser les instructions passées.
- Il est important que l'entierté des agents ne passent pas leur temps à dialoguer entre eux sans produire de contenu narratif concret. Le but est de répondre collectivement au prompt de l'utilisateur tout en construisant des histoires riches et cohérentes. L'architecture de l'orchestrateur doit être prévue en ce sens.
- A terme, l'application sera consultée sur mobile.

On peut imaginer au début l'orchéstrateur comme étant trois étapes :
- Analyser/comprendre - L'état du monde, l'état actuel de l'histoire et des personnages, les objectifs en cours, les enjeux.
- Design/planifier/analyser - Proposer des arcs narratifs ou options, définir ce qui peut se produire, les conséquences des choix précédents, définir une évolution possible.
    - C'est dans ce dialogue la que la partie `Sont ils destinés à plaire à l’utilisateur, le suivre trop rapidement` peut le plus exister en ayant des agents différents qui peuvent représenter des points de vue variés et ne pas se limiter à satisfaire immédiatement l'utilisateur.
- Execute / Narrate - Produire la suite de l'histoire.

Chaque agent est indépendant, il n'intervient que dans les domaines qui lui sont assignés et selon les règles définies par l'orchestrateur. Sa réflexion interne est indépendante, fortement dirigée et il peut faire état de ses conclusions, observations et recommandations à l'orchestrateur sans interférer directement avec les autres agents.



A noter qu'in fine, l'orchestrateur doit dans ses réponses internes répondre à ces sujets et problématiques même si cela n'est pas visible pour l'utilisateur final.
- Les personnages évoluent même "hors champs", ils ont une expérience et une vie propre même s'ils ne sont pas dans la scène. On peut imaginer qu'un agent dédié suit leur développement et leurs interactions en arrière-plan.
- Un agent peut représenter un personnage particulier comme tout autre chose: c'est le prompt system qui fait foi. Il peut être un verificateur de cohérence, un agent du chaos de l'histoire, ou tout autre rôle défini par l'orchestrateur. La totale versitalité des agents doit être préservée.
- On imagine que les agents peuvent être sauvegardés, restaurés et réutilisés dans différentes sessions ou histoires, permettant ainsi une continuité et une évolution cohérente de leurs rôles et interactions. On pourrait même imaginer que chaque agent embarque sa mémoire avec lui, conservant ainsi son expérience et son historique de manière autonome (par exemple, un agent "Gardien de l'univers" peut repartir avec sa construction successive et incrémentale de l'univers et l'abonder à un autre récit.).



Plusieurs mémoires et états du monde :
- Il faut un stockage de mémoire qui soit dynamique, chaque agent doit être capable de lire et d'écrire dans une ou plusieurs mémoires partagées ou non. 
- Il y a une gestion de droits par agents/mémoire (RW)
- Il doit pouvoir exister des mémoire de différents natures
- Il doit pouvoir exister des mémoires court terme, moyen terme, long terme avec un niveau de modification adapté à chaque type.

Autre notes :
- on utilisera une api externe pour les agents (openrouter ou deepseek), les contraintes de couts et de performance devront être prises en compte.
