# Chat : décisions et invariants

Chat est un flagship d'un domaine de l'application. Il illustre les principes de séparation des responsabilités, d'immuabilité des exécutions et de gestion des branches dans les conversations.

## Frontières et responsabilités

Le domaine possède `chat_message`, `chat_turn` et `chat_branch`, regroupés dans
`db/entities/chat`. Le préfixe désigne une responsabilité, pas toutes les données
utilisées pendant une conversation : projets, appels LLM et mémoire
gardent leurs domaines propres.

Le point d'entrée est [index.ts](../../apps/api/src/modules/chat/index.ts) :
il assemble les classes et expose le module au serveur, sans conteneur d'injection.
Le rangement reste plat par responsabilité, sans couche abstraite par classe.

| Frontière | Responsabilité |
| --- | --- |
| `routes/` | URL, méthodes et authentification ; délégation au contrôleur |
| `controllers/` | Validation des requêtes, adaptation au service, conversion des modèles en DTO et cycle de vie SSE |
| `services/` | Cas d'usage et services message, tour, branche ; adaptation narrateur à `callLLM` |
| `repositories/` | Un repository par entité ; SQL et assemblage des jointures en modèles avec `Date`, sans règle de branchement ni DTO HTTP |
| `mappers/` | Conversion des modèles en DTO JSON à la frontière HTTP : fonctions `toChatBranchDto`, `toMessageDto`, `toChatTurnDto`, etc. |
| `types/` | Données et signatures internes ; pas d'interface miroir pour chaque classe |

`ChatService` orchestre les services d'entité, chacun utilisant uniquement son
repository. Une jointure de lecture reste dans le repository qui construit la
projection ; elle n'autorise pas ce repository à modifier les autres entités.
Les préconditions et erreurs publiques appartiennent aux services/contrôleurs,
pas aux repositories.

Le service projets possède le verrou et la transaction : le chat lui demande
un contexte verrouillé, puis ses services utilisent tous cette même transaction.
Réciproquement, la création du projet initialise sa branche via le service branche,
pas par une écriture directe dans sa table. Les transactions Drizzle n'entrent
pas dans `ChatService`.

Le domaine mémoire fournit une session liée à cette transaction : snapshot
d'entrée, vues filtrées par agent, Gardien et réduction atomique dans un
savepoint. Un échec mémoire préserve une narration entièrement validée, y
compris lors d'une déconnexion après sa réception. Les résultats des relances
sont ajoutés dans `memory_run` ; le résultat mémoire affiché est une projection
du dernier traitement, sans mutation du récit terminal.
Les tags, les branches et les routes de l'API sont détaillés ci-dessous.

Les [schémas Zod](../../packages/shared/src/chat/schemas) sont séparés par entité
ou protocole, et leurs [types](../../packages/shared/src/chat/types.ts) restent
inférés : aucune deuxième définition des DTO. Les services manipulent les modèles
avec `Date` ; seuls les mappers de sortie convertissent leurs dates en chaînes ISO.
Les diagnostics internes des tours ne sont masqués qu'à cette frontière.
L'API frontend expose `chatApi.ts`, avec `chatStream.ts` pour le transport et
`chatEvents.ts` pour le parsing SSE ; les hooks et composants gardent leurs responsabilités.

## Pourquoi des exécutions immuables et des parents partagés ?

**Contexte.** Remplacer une réponse ferait perdre la traçabilité ; copier toute
la conversation à chaque variante dupliquerait les messages et compliquerait
l'identité des faits mémorisés.

**Décision.** Un tour est une exécution du pipeline pour une saisie utilisateur,
pas une paire de bulles modifiable. Deux tentatives peuvent partager la même
saisie, mais ont leurs propres statuts, réponses et traces. Un tour terminal
n'est jamais remplacé.

Une branche désigne une tête. Son historique remonte les `parent_turn_id`,
indépendamment des dates et UUID. `origin_branch_id` décrit la provenance d'un
tour, **pas son appartenance exclusive à une branche**.

```text
Principale : A -> B -> C -> D
Alternative :     \-> C' -> D'
```

Les deux branches partagent A et B. Les commandes disponibles sont volontairement
limitées à la tête :

| Commande | Effet et raison |
| --- | --- |
| Envoyer | Ajoute un enfant ; après un échec, la saisie sans réponse reste dans le chemin. |
| Régénérer une réussite | Crée une branche et un tour frère ; repart du parent pour exclure l'ancienne réponse. |
| Réessayer un échec | Crée un tour frère sur la même branche ; conserve l'ancienne tentative sans répéter la saisie. |

La configuration utilisée est celle du projet au moment de la commande, pas
un rejeu de l'ancien prompt. La trace conserve le prompt réellement envoyé.
Le contexte narrateur retient les 20 derniers tours entiers ; l'historique
affiché reste complet. Cette limite ne borne pas encore la lecture en base de
l'ascendance.

**Conséquences.** L'original reste consultable après une régénération, même si
l'alternative échoue. L'interface ne bascule vers l'alternative qu'après succès ;
elle propose explicitement d'ouvrir une alternative échouée. La branche consultée
est dans `?branch=<uuid>`, pas dans un état actif global du projet.

La branche principale est créée atomiquement avec le projet. La référence
`projects.default_branch_id` est nullable uniquement pour permettre les
insertions circulaires ; le service ne rend pas de nouveau projet sans branche.

## Pourquoi garder une transaction pendant la génération ?

**Contexte.** Le MVP doit refuser les écritures concurrentes et ne pas annoncer
un résultat qui n'a pas été enregistré.

**Décision.** Les commandes et modifications/suppressions de projet partagent
le verrou projet `FOR UPDATE NOWAIT`. La tête attendue est vérifiée sous ce verrou :
un onglet périmé ou une mutation concurrente reçoit un conflit, sans appel LLM.
Le service transactionnel ne résout la commande qu'après commit. Les clés étrangères
composites interdisent les références entre projets.

Le contexte est chargé avant le début du flux : une erreur de lecture/intégrité
annule la commande, elle ne devient pas un faux échec fournisseur. Les erreurs
de génération conservent la saisie et le tour échoué, jamais une réponse
assistant partielle. L'historique expose une erreur générique ; le diagnostic
fournisseur reste dans la trace.

## Pipeline M4 et reconstruction du whiteboard

L'analyse utilise toutes les versions d'agents épinglées au projet et les exécute
en parallèle sur le même contexte de conversation. Chaque agent reçoit ses propres
instructions, sans les sorties des autres agents. Ses enveloppes sont validées
par le schéma partagé ; une sortie invalide est retentée une fois. Si un agent
échoue encore, le tour échoue et le Narrateur n'est pas appelé. Un projet sans
agent d'analyse reste valide : l'étape est ignorée et le Narrateur reçoit un
whiteboard vide.

Le prompt d'analyse attribue un budget indicatif par agent :
`max(3, floor(12 / nombre d'agents d'analyse))` éléments. La cible globale de
12 n'est donc pas un plafond strict, notamment au-delà de quatre agents. Ce
budget n'est pas un quota à remplir : un agent peut ne rien proposer et doit
privilégier des apports distincts, utiles à la prochaine scène et propres à sa
spécialité, sans répétition du contexte. Il n'y a ni troncature des réponses
valides, ni rejet pour dépassement, ni redistribution après un échec.

Le whiteboard est une projection, pas une table persistée. Les traces `llm_call`
par `turn_id` conservent requête et réponse brutes, statut, étape, agent et version
de l'agent, durée et tokens. Le Narrateur ne produit que la prose, diffusée puis
enregistrée comme message assistant. Les tours du MVP ont enregistré une réponse
`<resolution>…</resolution><prose>…</prose>` : leur relecture depuis les traces
(résumé du tour, attribution, relance du Gardien) n'en garde que la prose
(`narratorProse`), jamais la résolution. Le module Traces reconstruit le résumé de pipeline et le
whiteboard depuis ces appels. Il vérifie d'abord l'appartenance du tour au projet ;
le détail d'un appel est ensuite limité à son `turn_id`. Les prompts et réponses
brutes ne sont renvoyés qu'à la demande, sans exposer l'erreur fournisseur stockée.
Les routes sont `GET /api/projects/:projectId/turns/:turnId/traces` pour le résumé
et `GET /api/projects/:projectId/turns/:turnId/traces/:callId` pour le détail.

## Direction facultative

Un projet peut épingler au plus un Directeur (phase et contrat `direction`). Sans
Directeur, le tour se déroule comme avant. Sinon, après l'analyse et avant le
Narrateur, un appel non streamé reçoit la saisie, l'historique, le whiteboard dont
chaque item porte un identifiant (`c1`, `c2`…) et les directions des 3 derniers
tours. Sa sortie est validée contre ce whiteboard : chaque item est retenu ou
écarté une seule fois avec un `why`, une `tension` parmi `monter`, `tenir`,
`relacher`, `basculer`, et 0 à 2 nudges de types distincts (`saillance`, `retard`,
`pression`, `complication`, `relance`), dont aucun type n'a servi au tour
précédent ; un `basis` désigne un item existant.

La direction est résolue (items recopiés tels quels) et enregistrée dans
`chat_turn.direction`. Le Narrateur reçoit alors la direction et les seuls items
retenus, à la place du whiteboard, avec une consigne fixe : la prose répond
d'abord à la saisie, tension et nudges sont des pressions, pas des faits.

Une sortie invalide est retentée une fois. Si l'appel échoue encore (erreur
fournisseur ou sortie invalide), l'étape `direction` est signalée en échec, la
direction reste nulle et le Narrateur reçoit le whiteboard complet ; le tour
continue. Toute autre erreur fait échouer le tour. Le résumé de traces expose
la phase (`direction`) avec statut, durée, nombre d'appels et direction ; son
coût figure dans les appels `direction` et dans le registre `llm_usage`.

L'orchestration du tour coordonne l'analyse, la direction facultative, la restitution, puis la mémoire M6.
Les propositions du Gardien sont réduites dans un savepoint ; un échec de mémoire
est enregistré sans annuler une narration terminée. Les détails d'exécution et
les limites figurent dans [`pipeline.md`](../pipeline.md).

**Conséquences et limites.** Le verrou et une connexion restent occupés pendant
l'appel LLM. Les événements de début, progression d'étape/agent et delta sont
provisoires ; seul le résultat terminal suit le commit, puis le client recharge
l'état persistant. La progression disparaît après succès ou échec ; les traces
persistées restent accessibles depuis les tours du chemin affiché.
Les événements de progression sont `chat.pipeline.stage` et `chat.pipeline.agent`.
Une déconnexion annule l'appel et tente de conserver l'échec. Un crash peut
annuler la transaction alors que l'appel est facturé ; les traces, écrites sur
une connexion distincte, peuvent survivre. Il n'y a pas de garantie « exactement
une fois » ni de reprise automatique : après coupure, recharger l'historique et
les branches plutôt que relancer silencieusement.

## Migration et exploitation

`0002_chat_branching.sql` renomme les tables M2 sans copier ni supprimer leur
historique. Le backfill construit une branche principale par projet, y compris
pour un projet vide ou un dernier tour échoué. Il réutilise l'UUID du projet
pour cette branche afin de ne pas exiger d'extension UUID ou PostgreSQL 18 ;
les nouvelles branches utilisent des UUID v7 applicatifs.

Sauvegarder la base et arrêter les anciennes instances avant application :
le renommage n'est pas compatible avec l'ancienne version. La migration refuse
les incohérences détectables du modèle M2 ; les examiner avant de relancer,
sans nettoyage automatique. Les migrations déjà appliquées restent inchangées.
Pour les tests réels de persistance et de migration, utiliser uniquement une
[base PostgreSQL jetable](../DEVELOPMENT.md#tests-postgresql).

## Contrainte pour les prochains étages

Whiteboard, résolution, propositions et traces référencent l'exécution par
`turnId`, sans remplacer les résultats d'une autre tentative.