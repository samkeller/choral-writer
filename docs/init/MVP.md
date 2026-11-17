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
- **Un seul point d'appel LLM** : `callLLM({ turnId, agentId, stage, messages, schema? })`. Il écrit systématiquement la trace (prompt, réponse, tokens, durée, erreur). Une sortie JSON invalide est retentée une fois, puis l'entrée du whiteboard est marquée `error` et le pipeline continue.
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
| `whiteboard_entries` | `turn_id`, `agent_id`, `envelope` jsonb, statut |
| `llm_calls` | trace : `turn_id`, `agent_id`, étage, requête, réponse, tokens, durée, erreur |
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
    { "kind": "observation",    "text": "...", "importance": 2 },
    { "kind": "recommendation", "text": "...", "importance": 3 },
    { "kind": "constraint",     "text": "...", "importance": 3 },
    { "kind": "remember",       "text": "...", "importance": 1 }
  ]
}
```

Le champ `kind` est une chaîne libre. Les quatre valeurs ci-dessus sont les conventions de départ, et un nouveau type d'agent peut en inventer d'autres sans toucher au code. Le whiteboard est simplement la liste des enveloppes du tour.

**Narrateur** : un appel en streaming qui lit tout le whiteboard. Sa sortie est délimitée par des balises :
```
<resolution>ce qui se passe réellement, en faits</resolution>
<prose>le texte lu par le joueur</prose>
```
Le parseur de flux ne transmet au client que le contenu de `<prose>`. La résolution est stockée comme événement.

**Gardien (contrat 4.2)** : un appel unique qui lit le whiteboard, la résolution et la prose. Il retourne des propositions typées :
```json
{ "v": 1, "proposals": [
  { "op": "upsert", "memory": "Personnages", "key": "Mara",
    "content": "A perdu sa main gauche.", "reason": "Scène 12" },
  { "op": "forget", "memory": "Lieux", "key": "Taverne", "reason": "Détruite" }
]}
```

**Réducteur** : une transaction qui valide chaque proposition (schéma, mémoire existante, clé et contenu valides, règle d'écriture codée en dur), écrit les événements et met à jour `memory_entries`. Chaque rejet est journalisé avec un code (`UNKNOWN_MEMORY`, `INVALID_SCHEMA`, `FORBIDDEN`, `EMPTY_CONTENT`).

## 6. Maquette du visualiseur de traces

Écran mobile, détail d'un tour :
```
┌────────────────────────────┐
│ ←  Tour 12             ⋮   │
│ « J'ouvre la porte. »      │
├────────────────────────────┤
│ Pipeline│Whiteboard│Appels │
├────────────────────────────┤
│ ① Analyse            1,8 s │
│   ● Cohérence   ok   0,9 s │
│   ● Chaos       ok   1,4 s │
│   ● Avocat      erreur  ⚠  │
│ ② Narrateur          4,2 s │
│   ● résolution + prose  ›  │
│ ③ Gardien            1,1 s │
│   ● 4 propositions      ›  │
│ ④ Réducteur   3 ✓   1 ✗    │
│   ✗ UNKNOWN_MEMORY      ›  │
└────────────────────────────┘
```

Onglet Whiteboard :
```
┌────────────────────────────┐
│ Chaos                      │
│ « Une clé manque. »        │
│  ▸ recommendation  ●●●     │
│    Faire échouer l'ouvert. │
│  ▸ remember        ●○○     │
│    La porte est verrouillée│
├────────────────────────────┤
│ Cohérence …                │
└────────────────────────────┘
```

Tiroir d'un appel (au clic sur une ligne) :
```
┌────────────────────────────┐
│ Chaos · analyse            │
│ 1,4 s · 812 → 240 tokens   │
│ [Prompt] [Réponse] [Brut]  │
│ system: …  (copier)        │
└────────────────────────────┘
```

Sur desktop, trois colonnes : liste des tours à gauche, pipeline au centre, détail de l'appel ou du whiteboard à droite. Chaque élément cliquable ouvre son contenu complet, et un tour en erreur est signalé dès la liste.

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
- Étage Analyse en parallèle, enveloppes validées par Zod et stockées sur le whiteboard.
- Narrateur lisant le whiteboard, parseur de balises et streaming de la prose seule.
- *Démontrable* : trois agents d'analyse (par exemple Cohérence, Chaos, Avocat du diable) influencent visiblement la narration.

**M5 : Visualiseur de traces**
- Écrans de la section 6, avec accès au prompt et à la réponse brute de chaque appel, tokens et durées.
- Accès depuis un bouton sur chaque message du chat.
- *Démontrable* : comprendre pourquoi une réponse est telle qu'elle est, en moins de trois clics.

**M6 : Mémoire simple et Gardien**
- CRUD des mémoires et de leurs entrées via l'interface, avec historique des versions lisible à partir des événements.
- Gardien produisant des propositions, Réducteur transactionnel, rejets visibles dans la trace.
- Entrées mémoire injectées dans la vue de contexte de tous les agents.
- *Démontrable* : un fait établi au tour 3 est restitué au tour 20.

**M7 : Finition MVP**
- Passe UX mobile, états de chargement et d'erreur, page de démonstration avec un projet d'exemple prêt à jouer.
- Documentation `docs/pipeline.md` à jour.

## 8. Après le MVP

**Lot suivant : conception mémoire générique**
- Types de mémoire (`kind`) et horizons court, moyen et long terme avec règles de modification propres.
- Table de droits lecture/écriture par agent et par mémoire.
- Connaissances par personnage (un personnage ne sait que ce qu'il a appris).
- Vue de contexte configurable par agent.

**TODO**
- Annuler un tour, le régénérer, créer une branche.
