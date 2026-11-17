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
| `memories` | `project_id`, nom, `kind` (texte libre), `config` jsonb |
| `memory_entries` | `memory_id`, `key`, `content`, `version`, `deleted_at` (c'est la **projection**) |
| `events` | journal append-only : `project_id`, `turn_id`, `type`, `payload`, `seq` |

Les mémoires ont un `kind` en texte libre et un `config` jsonb. Cela permet d'ajouter des types de mémoire sans migration.

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

**Gardien (contrat 4.2)** : un appel unique qui lit le whiteboard, la résolution et la prose. Il retourne des propositions typées :
```json
{ "v": 1, "proposals": [
  { "op": "upsert", "memory": "Personnages", "key": "Mara",
    "content": "A perdu sa main gauche.", "reason": "Scène 12" },
  { "op": "forget", "memory": "Lieux", "key": "Taverne", "reason": "Détruite" }
]}
```

**Réducteur** : une transaction qui valide chaque proposition (schéma, mémoire existante, clé et contenu valides, règle d'écriture codée en dur), écrit les événements et met à jour `memory_entries`. Chaque rejet est journalisé avec un code (`UNKNOWN_MEMORY`, `INVALID_SCHEMA`, `FORBIDDEN`, `EMPTY_CONTENT`).

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

**M6 : Mémoire simple et Gardien**
- CRUD des mémoires et de leurs entrées via l'interface, avec historique des versions lisible à partir des événements.
- Gardien produisant des propositions, Réducteur transactionnel, rejets visibles dans la trace.
- Entrées mémoire injectées dans la vue de contexte de tous les agents.
- *Démontrable* : un fait établi au tour 3 est restitué au tour 20.

**M7 : Finition MVP**
- Passe UX mobile, états de chargement et d'erreur, page de démonstration avec un projet d'exemple prêt à jouer.
- Documentation `docs/pipeline.md`, README à jour. On supprime toute la doc non-nécessaire ou qui représente du legacy -> clean slate.

## 8. Après le MVP

**Lot suivant : conception mémoire générique**
- Types de mémoire (`kind`) et horizons court, moyen et long terme avec règles de modification propres.
- Table de droits lecture/écriture par agent et par mémoire.
- Connaissances par personnage (un personnage ne sait que ce qu'il a appris).
- Vue de contexte configurable par agent.

**TODO**
- Annuler un tour, le régénérer, créer une branche.
