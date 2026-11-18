# Plan MVP

## 1. Stack

| Domaine | Choix |
|---|---|
| Runtime | Node LTS, TypeScript strict, pnpm workspaces |
| Serveur | Fastify (REST + SSE) |
| Base | PostgreSQL (Railway), Drizzle ORM + drizzle-kit pour les migrations |
| Validation | Zod, partagé entre API, front et sorties LLM |
| LLM | SDK `openai` pointé sur OpenRouter ou DeepSeek (`baseURL`), derrière une fonction unique `callLLM` |
| Front | React + Vite, Mantine (composants, dark mode), Tailwind (mise en page), Axios (REST) |
| Streaming | `fetch` + `ReadableStream` pour le SSE |
| Auth | Mot de passe en variable d'environnement, cookie signé |
| Tests | Vitest, client LLM simulé |
| Local | `docker-compose` avec Postgres |

## 2. Structure du dépôt

```
choral-writer/
├── apps/
│   ├── api/src/
│   │   ├── server.ts · config.ts
│   │   ├── auth/
│   │   ├── db/              schema.ts · client.ts · migrations/
│   │   ├── modules/         projects · agents · memories · turns · traces
│   │   │                    (chacun : routes.ts · service.ts)
│   │   ├── pipeline/        run-turn.ts · context.ts · whiteboard.ts
│   │   │                    analysis-stage.ts · output-stage.ts
│   │   │                    narrator-parser.ts · reducer.ts
│   │   └── llm/             call-llm.ts · stream.ts
│   └── web/src/
│       ├── pages/           Projects · Chat · Agents · Memory · Trace
│       ├── components/ · hooks/ · api/ (axios) · theme/
├── packages/shared/         schémas Zod : enveloppe, propositions, DTO
├── docs/                    vision.md · pipeline.md · decisions.md · mockups/
└── docker-compose.yml
```

## 3. Standards de code et de données

- **Zod est la source de vérité.** Un schéma dans `packages/shared` sert à valider l'API, à typer le front et à parser les sorties JSON des LLM.
- **Un seul point d'appel LLM** : `callLLM({ turnId, agentId, agentVersionId, stage, messages, schema? })`. Il écrit systématiquement la trace (prompt, réponse, tokens, durée, erreur). Une sortie JSON invalide d'un agent d'analyse est retentée une fois ; si l'appel échoue encore, le tour échoue sans lancer la restitution.
- **Base** : ids UUID v7, `timestamptz`, `snake_case` en base et `camelCase` en TypeScript. Les champs évolutifs sont des `jsonb` versionnés (`v: 1`).
- **Erreurs API** : format unique `{ error: { code, message } }`.
- **Événements** : nommage `domaine.objet.action` (ex. `memory.entry.upserted`) avec un payload `jsonb`.
- **Un module = routes + service**, et les routes restent minces.

## 4. Modèle de données

| Table | Contenu |
|---|---|
| `projects` | nom, `system_prompt` |
| `agent` | identité globale, phase fixe (`analysis`, `restitution`), contrat de sortie fixe (`envelope`, `narrative`, `memory_proposals`) |
| `agent_version` | `agent_id`, numéro de version, nom et instructions immuables |
| `project_agent` | association many-to-many, version épinglée par projet |
| `messages` | `project_id`, `role` (user ou assistant), contenu |
| `turns` | `project_id`, `user_message_id`, statut, timestamps |
| `llm_calls` | trace : `turn_id`, `agent_id`, `agent_version_id`, étage, requête, réponse, tokens, durée, erreur |
| `memory_settings` | activation, révision et catalogue de tags de lecture du projet |
| `memory_bank` | révision et entrées texte versionnées par branche : identifiant, titre, contenu, tags, protection et archive |
| `memory_run` | résultat et changements de chaque traitement du Gardien pour un tour et une branche |
| `events` | journal append-only : `project_id`, `turn_id`, `type`, `payload`, `seq` |

Les catalogues et banques mémoire sont des documents JSON versionnés (`v: 2`).
Les tags ont une identité stable et une définition courte ; ce ne sont pas des
mots-clés d'activation. La sélection des lecteurs est commune au projet, les
souvenirs et leurs corrections suivent la branche.

## 5. Pipeline

```
Saisie → [0] Prompt utilisateur
  → [1] ANALYSE : N agents en parallèle, isolés → enveloppes sur le whiteboard
  → [2] RESTITUTION : Narrateur (streaming) → Gardien (propositions mémoire)
  → [3] Réducteur (code) : valide, écrit événements + projection
```

**Contexte** : `context.ts` construit pour chaque agent une vue composée du prompt système du projet, des N derniers messages, des entrées mémoire et de la saisie. Les agents d'analyse reçoivent cette vue et rien d'autre.

**Enveloppe (contrat 4.1)** : un format unique pour tous les agents d'analyse.

```json
{
  "v": 1,
  "agent": "Chaos",
  "summary": "Une phrase de synthèse.",
  "items": [
    { "kind": "observation",    "text": "...", "importance": "NORMAL" },
    { "kind": "recommendation", "text": "...", "importance": "HIGH" },
    { "kind": "constraint",     "text": "...", "importance": "HIGH" },
    { "kind": "remember",       "text": "...", "importance": "LOW" }
  ]
}
```

Le champ `kind` est une chaîne libre. Les quatre valeurs ci-dessus sont les conventions de départ, et un nouveau type d'agent peut en inventer d'autres sans toucher au code. `importance` vaut `LOW` (détail secondaire), `NORMAL` (information pertinente) ou `HIGH` (information qui change sensiblement l'interprétation ou l'action). Le whiteboard n'est pas une table : c'est une vue reconstruite à partir des traces et résultats des étapes pour un tour.

**Narrateur** : un appel en streaming qui lit tout le whiteboard. Sa sortie est délimitée par des balises :
```
<resolution>ce qui se passe réellement, en faits</resolution>
<prose>le texte lu par le joueur</prose>
```
Le parseur de flux ne transmet au client que le contenu de `<prose>`. La réponse brute tracée du Narrateur conserve les deux sections, ce qui permet de reconstruire la résolution sans la dupliquer dans une table d'événements.

**Gardien (contrat 4.2)** : un appel qui lit les définitions de tags, la mémoire
active, la résolution et la prose. Les prompts complets des autres agents et
leurs recommandations ne sont pas recopiés dans son contrat. Il retourne des
propositions typées, avec les identifiants réels des tags :
```json
{ "v": 2, "proposals": [
  { "op": "create", "tagIds": ["<UUID du tag world_rules>"], "key": "Mara",
    "content": "Mara a perdu sa main gauche.", "reason": "Blessure établie dans la scène." },
  { "op": "archive", "entryId": "<UUID du souvenir>", "reason": "Information devenue obsolète." }
], "tagSuggestions": [] }
```

**Réducteur** : valide tout le lot (schéma, tags existants, souvenirs non protégés,
cibles non répétées et limites), puis écrit la banque et le résultat dans un
savepoint. Un échec annule toutes les modifications mémoire, pas la narration.
Une suggestion de tag ne crée aucun tag et ne modifie aucun abonnement.

## 6. Progression et visualiseur de traces

Pendant une génération, une vue compacte apparaît dans la conversation, juste après la saisie :

```text
┌────────────────────────────────┐
│ ● Analyse · 2/3 agents · 1,4 s │
│   Analyse 1,4 s · Narrateur …  │
│   ━━━━━━━━━━━━━━━━────────     │
└────────────────────────────────┘
```

Elle suit les étapes réellement exécutées (Analyse puis Narrateur), affiche le temps écoulé et l'avancement des agents parallèles. Elle disparaît à la fin ou à l'échec du tour ; les traces restent consultables depuis les messages persistés.

L'action d'inspection sur un message ouvre un tiroir contextuel, pleine largeur sur mobile et superposé à droite sur desktop :

```text
┌────────────────────────────────┐
│ Traces du tour                  │
│ [Pipeline] [Whiteboard] [Appels]│
│ Analyse                         │
│   Chaos · OK · 0,8 s · Inspecter│
│ Narrateur · OK · 1,5 s          │
│   « La porte résiste. »         │
└────────────────────────────────┘
```

Les appels sont chargés à la demande. Leur détail donne accès au prompt exact, à la réponse brute, aux tokens, à la durée et au JSON complet. Les traces passées sont accessibles depuis les tours du chemin de conversation sélectionné ; il n'y a pas de route globale `/traces`. Le Gardien et le Réducteur n'apparaîtront qu'une fois implémentés en M6.

## 7. Jalons du MVP

**M1 : Socle**
- Monorepo, API Fastify, Drizzle + migrations, Postgres local et Railway, auth par mot de passe.
- `callLLM` avec le client OpenAI-compatible et la trace.
- Shell du front : Mantine, dark mode par défaut, navigation mobile-first (barre du bas), thème.
- *Démontrable* : se connecter et voir un écran vide propre sur téléphone.

**M2 : Projets et chat**
- CRUD de projets (nom, prompt système) et conversation avec streaming d'une seule réponse.
- Historique persisté.
- *Démontrable* : un chatbot par projet.

**M3 : Agents en base**
- Bibliothèque globale d'agents réutilisables, versions consultables du nom et des instructions.
- Phase et contrat de sortie fixes ; pas de position pour les analyses parallèles.
- Équipe configurable depuis le projet, avec une version épinglée par agent.
- Exactement un agent de réponse utilisateur et un Gardien mémoire, tous deux en restitution.
- Dernières versions des agents par défaut à la création ; mise à jour explicite pour les projets existants.
- *Démontrable* : modifier les instructions du Narrateur change le ton de la réponse.

**M4 : Pipeline whiteboard**
- Étage Analyse en parallèle, enveloppes validées par Zod et conservées dans les traces LLM par tour.
- Whiteboard reconstruit comme une vue des traces ; pas de table de projection dédiée.
- Narrateur lisant le whiteboard, parseur de balises et streaming de la prose seule.
- *Démontrable* : trois agents d'analyse (par exemple Cohérence, Chaos, Avocat du diable) influencent visiblement la narration.

**M5 : Visualiseur de traces**
- Progression inline temporaire des étapes et agents pendant la génération, avec durée écoulée.
- Tiroir contextuel depuis les messages, avec vues Pipeline, Whiteboard et Appels ; détail prompt/réponse brute chargé à la demande.
- Traces passées limitées aux tours du chemin affiché ; aucune page globale `/traces`.
- *Démontrable* : comprendre pourquoi une réponse est telle qu'elle est, en moins de trois clics.

**M6 : Mémoire simple et Gardien — implémenté**
- Navigation du projet : Récit et Configuration. La configuration regroupe paramètres, agents et mémoire ; pas de drawer de configuration ni de page mémoire indépendante.
- Composition desktop : rail Projet / Agents / Mémoire, listes et détail côte à côte, accès mémoire visibles avant les instructions repliables. Les longs contenus défilent dans leur panneau sans ajouter de défilement à la page.
- Banque d'entrées texte alimentée par le Gardien ; consultation, recherche, correction, protection et archivage depuis la configuration, pour la branche sélectionnée.
- Un seul sélecteur de tags de lecture par agent : intersection non vide pour lire une entrée ; sélection vide pour ne rien recevoir ; lecture complète explicitement choisie. Aucun cumul périmètres/tags/préfixes.
- Proposition automatique de tags et d'abonnements à partir des agents, prévisualisée et modifiable avant application explicite. Cet appel de configuration est le seul à recevoir les prompts complets des agents.
- Gardien proposant créations, éditions et archivages ; validation et écriture atomique du lot, changements et échecs visibles dans les traces.
- Le Gardien utilise les définitions des tags et peut suggérer un nouveau contrat de lecture, sans l'activer ni réabonner les agents. Il doit lire toute la mémoire pour la maintenir.
- Chaque agent reçoit seulement les souvenirs correspondant à ses tags. Pas de filtrage du prompt système ni de l'historique conversationnel en M6 ; le filtrage ne garantit pas la justesse sémantique du classement effectué par le LLM.
- Mémoire désactivable ; son échec ne bloque pas la suite du récit et ne conserve aucune écriture du lot.
- Migration des banques, snapshots et anciens filtres sans élargissement de lecture ; métadonnées historiques conservées.

**M7 : Finition MVP**
- Passe UX mobile, états de chargement et d'erreur, page de démonstration avec un projet d'exemple prêt à jouer.
- Documentation `docs/pipeline.md`, README à jour. On supprime toute la doc non-nécessaire ou qui représente du legacy -> clean slate.
- Supprimer le code mort, refacto.
- préparer MEP

## 8. Après le MVP

**Lot suivant : conception mémoire générique**
- Types de mémoire (`kind`) et horizons court, moyen et long terme avec règles de modification propres.
- Droits d'écriture par agent plus fins, au-delà des périmètres de lecture et règles mémoire prévus en M6.
- Connaissances par personnage (un personnage ne sait que ce qu'il a appris).
- Vue de contexte configurable par agent au-delà de la seule sélection mémoire, déjà prévue en M6.

**TODO**
- Annuler un tour, le régénérer, créer une branche.
