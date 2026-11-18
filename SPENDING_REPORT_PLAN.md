Ran terminal command: npm view @mantine/charts@8 version peerDependencies dependencies --json 2>$null; Write-Output '--- latest ---'; npm view @mantine/charts version 2>$null; Write-Output '--- recharts latest ---'; npm view recharts version 2>$null

Ran terminal command: Get-Content D:\dev\choral-writer\apps\web\node_modules\@mantine\core\package.json | Select-String '"version"'; Write-Output '--- root TODO.md ---'; Get-Content D:\dev\choral-writer\TODO.md | Select-Object -First 12

The user's feedback is clear. Let me verify the chart library facts before writing the roadmap.

 

Ran terminal command: Write-Output '--- recharts 2.x latest ---'; npm view recharts@^2 version 2>$null | Select-Object -Last 3; Write-Output '--- charts 8.3.18 peers ---'; npm view '@mantine/[charts@8.3.18](mailto:charts@8.3.18)' peerDependencies peerDependenciesMeta --json 2>$null; Write-Output '--- is @mantine/hooks installed? ---'; Test-Path D:\dev\choral-writer\apps\web\node_modules\@mantine\hooks\package.json; Get-ChildItem D:\dev\choral-writer\apps\web\node_modules\@mantine -Directory | Select-Object -ExpandProperty Name

Get Mantine props or signature
Completed with input: {
  "name": "LineChart",
  "kind": "component"
}

Fetched [https://mantine.dev/charts/getting-started/](https://mantine.dev/charts/getting-started/)
Completed with input: {
  "url": "https://mantine.dev/charts/getting-started/",
  "max_length": 4000
}

Ran terminal command: Write-Output '--- recharts anywhere in lockfile? ---'; Select-String -Path D:\dev\choral-writer\pnpm-lock.yaml -Pattern '^  recharts' -SimpleMatch | Select-Object -First 5; Write-Output '--- charts in lockfile? ---'; Select-String -Path D:\dev\choral-writer\pnpm-lock.yaml -Pattern 'mantine/charts' -SimpleMatch | Select-Object -First 5; Write-Output '--- hooks in lockfile? ---'; Select-String -Path D:\dev\choral-writer\pnpm-lock.yaml -Pattern "'@mantine/hooks'" -SimpleMatch | Select-Object -First 5

Arbitrages reçus et intégrés. Voici le plan, réécrit en format roadmap exploitable.

---

# Roadmap — Cost & Usage Analytics

## 0. Décisions actées

| # | Décision | Conséquence |
|---|---|---|
| D1 | **Deux niveaux dans la conversation, pas trois.** Aucun nouveau drawer, aucun popover. | La ligne discrète pointe vers l'onglet `Consommation` du projet. Le `TraceDrawer` existant reste inchangé (on n'en ajoute pas). |
| D2 | **`@mantine/charts` + `recharts` retenus** pour les graphiques. | Vérifié : `@mantine/charts@8.3.18` exige `@mantine/core@8.3.18` — c'est **exactement** la version installée. `@mantine/hooks@8.3.18` et `recharts@^2.15.4` à ajouter explicitement. |
| D3 | **Pas de domain `modules/usage`.** Le code vit sous `apps/api/src/llm/usage/`. | `llm/` possède déjà la frontière fournisseur ; la comptabilité en dépend directement. |
| D4 | **Factory de providers** pour isoler les spécificités. | Deux comportements réels à couvrir *aujourd'hui* (DeepSeek : cache + pas de coût ; OpenRouter/compatible : coût fournisseur possible) — ce n'est pas de la généralisation spéculative. |
| D5 | **Comparaison entre modèles → ROADMAP** (après modèles par agent). | Données prévues, aucune UI. |
| D6 | **Projection de dépenses → écartée.** | — |
| D7 | **Budgets et alertes de seuil → écartés.** | Les limites *fournisseur* restent affichables dans la carte solde. |

### Décision UI retenue (résolution de la tension 2.1 / 5.1)

```text
Conversation (Récit)
  └─ ligne discrète par message   ← niveau 1, cliquable
        │  « 12,4 s · 0,021 $ · 4 220 tokens »
        ▼  lien réel, deep-linkable, pas de drawer
Onglet Consommation du projet      ← niveau 2
   ?tab=usage                     (vue projet + évolution)
   ?tab=usage&turn=<turnId>       (focus sur un message)
```

Le niveau 3 (détail par appel) n'existe plus comme surface nouvelle : il reste accessible via le `TraceDrawer` **déjà présent**, qui gagne simplement une colonne de coût dans sa liste d'appels existante — une amélioration d'un écran que l'utilisateur connaît, pas une surface ajoutée.

---

## 1. Architecture cible

### 1.1 Arborescence

```text
apps/api/src/
  llm/
    client.ts                 (existant — inchangé)
    call-llm.ts               (étendu : projectId requis + collecte des usages)
    index.ts                  (étendu : wiring recorder + strategy)
    providers/                ← NOUVEAU (factory)
      types.ts                    contrat ProviderStrategy
      deepseek.ts                 balance ✔ · cache ✔ · coût fournisseur ✘
      openrouter.ts               balance ~ (clé de gestion) · coût fournisseur ✔
      openaiCompatible.ts         repli : tokens seuls, solde non supporté
      index.ts                    createProviderStrategy(config) — factory
    usage/                    ← NOUVEAU (domaine comptable, sous llm/)
      usageService.ts             record(fact) · report(...) · turnDetail(...) · balance()
      pricingResolver.ts          résolution de grille + calcul (seul lieu qui manipule des montants)
      usageRepository.ts          une méthode SQL par besoin de rapport
      mappers/usageDto.ts
      controllers/usageController.ts
      routes/usageRoutes.ts
  db/entities/
    llmCall.ts                (existant)
    llmUsage.ts               ← NOUVEAU
    llmPrice.ts               ← NOUVEAU
  tests/fixtures/             ← NOUVEAU (P0)

packages/shared/src/
  usage/                      ← NOUVEAU, calqué sur src/chat/
    schemas/{usage,report,balance}.ts
    index.ts
    types.ts
```

Les **entités Drizzle restent dans `db/entities/`** (convention du projet, `llmCall.ts` y est déjà) ; la logique métier vit sous `llm/usage/`.

### 1.2 Contrat de la factory

```ts
export interface ProviderStrategy {
  readonly name: 'deepseek' | 'openrouter' | 'openai-compatible';
  /** Normalise les tokens, dont les champs de cache propres au fournisseur. */
  extractUsage(raw: unknown): { inputTokens: number | null; outputTokens: number | null; cachedInputTokens: number | null };
  /** Coût renvoyé par le fournisseur lui-même, s'il existe (OpenRouter `usage.cost`). */
  providerCostUsd(raw: unknown): number | null;
  /** Solde/crédits, ou raison explicite d'indisponibilité. */
  balance(): Promise<ProviderBalance>;
}
```

`createProviderStrategy(config)` sélectionne la stratégie via `LLM_PROVIDER` (`deepseek` | `openrouter` | `openai-compatible`), avec repli documenté par détection d'hôte de `LLM_BASE_URL`.

**Justification anti-YAGNI** : ce n'est pas une abstraction anticipée. Le code actuel doit déjà gérer trois situations réelles et distinctes, car `LLM_BASE_URL` est libre : (a) DeepSeek renvoie `prompt_cache_hit_tokens` mais aucun coût ; (b) OpenRouter renvoie `usage.cost` mais exige une clé de gestion pour le solde ; (c) tout endpoint compatible renvoie des tokens standards sans solde. Sans factory, ces trois cas s'éparpillent en conditions dans `call-llm.ts`. **Ajouter un provider supplémentaire reste hors-scope** : la factory isole les différences, elle n'en crée pas.

### 1.3 Modèle de données

Deux tables, plus **une colonne** recommandée.

```sql
CREATE TABLE choral_writer.llm_usage (
  id                  uuid PRIMARY KEY,
  call_id             uuid NOT NULL UNIQUE
                        REFERENCES choral_writer.llm_call(id) ON DELETE CASCADE,
  project_id          uuid NOT NULL
                        REFERENCES choral_writer.projects(id) ON DELETE CASCADE,
  turn_id             uuid,                       -- NULL pour memory_setup
  stage               text NOT NULL,
  stage_execution_id  uuid,
  agent_id            uuid,
  agent_version_id    uuid,
  provider            text NOT NULL,
  model               text NOT NULL,
  input_tokens        integer,
  output_tokens       integer,
  cached_input_tokens integer,
  duration_ms         integer NOT NULL,
  status              text NOT NULL,
  pricing_id          uuid REFERENCES choral_writer.llm_price(id),
  cost_basis          text NOT NULL,              -- provider_confirmed | priced | unpriced
  cost_micro_usd      bigint,                     -- NULL si unpriced
  currency            text NOT NULL DEFAULT 'USD',
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE choral_writer.llm_price (
  id                     uuid PRIMARY KEY,
  provider               text NOT NULL,
  model                  text NOT NULL,
  input_per_million      numeric(18,6) NOT NULL,
  output_per_million     numeric(18,6) NOT NULL,
  cache_read_per_million numeric(18,6),
  valid_from             timestamptz NOT NULL,
  valid_to               timestamptz,
  source                 text NOT NULL
);

ALTER TABLE choral_writer.llm_call ADD COLUMN project_id uuid;
```

Raisons structurelles :

| Choix | Justification |
|---|---|
| Table séparée plutôt qu'étendre `llm_call` | `llm_call` stocke les prompts/réponses complets → rétention limitée par nature. Un coût doit être permanent. Un registre financier ne dépend pas de la politique de rétention d'un journal de débogage. |
| `project_id` **dénormalisé et obligatoire** | `llm_call.turn_id` n'a aucune FK et `memory_setup` n'a pas de tour : joindre via `chat_turn` perdrait des appels réellement facturés. |
| `llm_call.project_id` (nullable, nouvelles lignes) | Rend la reconstruction d'une ligne `llm_usage` manquante possible et idempotente (contrainte `UNIQUE` sur `call_id`). Sans elle, un échec d'écriture comptable est irréparable. |
| `turn_id` nullable, sans FK | Un tour annulé ne doit pas effacer la dépense. |
| Pas de `branch_id` | L'appartenance à une branche se déduit de l'ascendance ; `origin_branch_id` est une provenance. La figer serait un contresens. |
| `cost_micro_usd` bigint (micro-USD) | Sommes exactes en SQL, aucun flottant, unité dans le nom. Arrondi au niveau de l'appel. |
| `pricing_id` + grille immuable | Le coût reste explicable sans dupliquer les tarifs sur chaque ligne, et reste figé. Verrou par trigger, sur le précédent de `agent_version`. |
| `cost_basis` à trois valeurs | Interdit structurellement de présenter une estimation comme un coût réel. |

Index : `(project_id, created_at)`, `(project_id, stage)`, `(turn_id)`, `(model)`, plus l'unicité `call_id`.

**Pas de table d'agrégation, pas de vue matérialisée.** Volumétrie estimée : 4 à 12 appels par message ; 10 000 messages ≈ 100 000 lignes. Le repository de chat fait déjà des CTE récursives à la demande.

---

## 2. Plan d'implémentation

Légende taille : **S** ≈ ½ journée · **M** ≈ 1–2 jours · **L** ≈ 3 jours et plus.

### P0 — Fondations : collecte, tarification, fixtures

**Objectif** : chaque appel produit une ligne de registre fiable et tarifée. Phase irréversible, aucune UI.

| ID | Tâche | Taille |
|---|---|---|
| P0-1 | `LLM_PROVIDER` dans `config.ts` + `.env.example` + `providers/` (factory, 3 stratégies) | M |
| P0-2 | `projectId` **obligatoire** dans `CallLLMInput` ; threadé aux 5 sites d'appel (analyse, narrateur, gardien, `memory_setup`, et `MemorySession`) | S |
| P0-3 | Extraction des tokens (dont cache) + coût fournisseur dans `call-llm.ts` | S |
| P0-4 | Entités `llmUsage` / `llmPrice` + migration (tables, index, trigger d'immuabilité, colonne `llm_call.project_id`, seed tarifaire `source='provider-docs'`) | M |
| P0-5 | `pricingResolver.ts` + `usageRepository.insert` + `usageService.record` | M |
| P0-6 | Wiring dans `llm/index.ts` ; **écriture en `try/catch` séparé** — un échec comptable doit être bruyant mais ne doit pas détruire une narration réussie | S |
| P0-7 | **Fixtures** (`tests/fixtures/`) : usine à projets/tours/`llm_call`/`llm_usage`, ids injectables, réutilisable par `chat.integration.test.ts` | M |
| P0-8 | **Seed de démo** : script qui génère un projet de démonstration avec N tours et une conso plausible | M |

**P0-7 / P0-8 — pourquoi en P0.** C'est le point que tu soulèves : sans fixtures, P1 à P3 ne sont ni testables ni démontrables. La base de dev contient trop peu d'historique pour développer un dashboard. Le seed permet de **concevoir et voir l'UI avant d'avoir brûlé des tokens réels**, et les fixtures deviennent la base commune des tests d'agrégation des phases suivantes. Garde-fous : refus d'exécution si `NODE_ENV=production`, projet dédié explicitement nommé.

**Tests** : résolution de grille (fenêtres, chevauchement, absence → `unpriced`) · sélection de base (coût fournisseur → `provider_confirmed` ; tokens + grille → `priced` ; tokens nuls → `unpriced`) · calcul cache hit/miss et arrondi · `call-llm` étendu (cache capturé, coût OpenRouter capturé, recorder appelé avec le `callId` de la trace, échec du recorder n'échoue pas l'appel) · intégration PostgreSQL : un tour produit exactement une ligne `llm_usage` par `llm_call`, `memory_setup` inclus avec `turn_id` null.

**✅ Acceptation** : lancer un tour en dev, puis `SELECT count(*) FROM llm_usage WHERE turn_id = …` égale le nombre de traces du tour ; chaque ligne porte un `project_id` non nul ; `cost_basis` cohérent avec le fournisseur configuré ; `pnpm test`, `pnpm typecheck` verts ; le seed de démo produit un jeu exploitable.

---

### P1 — MVP : le coût d'un message, dans la conversation

**Objectif** : répondre à « combien coûte ce message et pourquoi » sans quitter le récit. C'est le MVP livrable.

| ID | Tâche | Taille |
|---|---|---|
| P1-1 | DTO partagés dans `packages/shared/src/usage/` | S |
| P1-2 | `usageService.turnDetail` + `usageRepository` + routes `GET …/turns/:turnId/usage` et `GET …/branches/:branchId/usage/turns` | M |
| P1-3 | `pathIds()` extrait de `ChatTurnRepository.path()` — **une seule source de vérité** sur l'ascendance, composée par le service d'usage | S |
| P1-4 | `api/usage/usageApi.ts` + `hooks/useConversationUsage.ts` / `useTurnUsage.ts` (rechargement sur changement de `headTurnId`) | M |
| P1-5 | `components/usage/usageFormat.ts` — **formate, ne calcule jamais** | S |
| P1-6 | **Ligne niveau 1** dans `MessageList.tsx` : `12,4 s · 0,021 $ · 4 220 tokens`, lien vers `?tab=usage&turn=<turnId>`, nom accessible complet | M |
| P1-7 | Colonne de coût dans la liste d'appels **existante** du `TraceDrawer` (aucune surface nouvelle) | S |

**Tests** : mapper/DTO · hook (chargement, erreur, vide, annulation) · `MessageList` affiche la ligne et pointe la bonne URL · formatage · accessibilité du nom · revue : **aucune somme monétaire côté front**.

**✅ Acceptation** : chaque message terminé affiche durée · coût · tokens ; un appel `unpriced` est visible et **jamais compté comme 0 $** ; largeur mobile 360 px sans débordement ; aucun nouveau drawer ni popover introduit.

---

### P2 — Reporting projet (onglet Consommation)

**Objectif** : la vue par projet, avec les graphiques Mantine.

| ID | Tâche | Taille |
|---|---|---|
| P2-1 | `GET /api/projects/:projectId/usage/report` (synthèse, série par message, phases, agents, modèles, essais abandonnés, fiabilité) | M |
| P2-2 | Ajout des dépendances : `@mantine/charts@8.3.18`, `@mantine/hooks@8.3.18`, `recharts@^2.15.4` | S |
| P2-3 | Import `@mantine/charts/styles.css` dans `main.tsx`, **après** `@mantine/core/styles.css` | S |
| P2-4 | Onglet `Consommation` (`?tab=usage`) sur la page projet, via `ConfigurationWorkspace` / `ConfigurationSection` | M |
| P2-5 | **`LineChart`** : évolution du coût par message (niveau 1→2 navigable) | M |
| P2-6 | Répartition phases / agents / modèles : rangées + `Progress` (pas de camembert — illisible pour comparer) | S |

**Note dépendances** : `@mantine/charts@8.3.18` exige `@mantine/core@8.3.18` **exactement** — la version installée correspond déjà. `recharts` doit être **épinglé en 2.x** (`^2.15.4`) : la 3.x est publiée mais Mantine 8 documente et teste la 2.x. `@mantine/hooks` est présent en transitif mais **non hoisté** dans `apps/web/node_modules` → à déclarer explicitement.

**Tests** : somme des lignes niveau 1 = total du rapport (intégration) · temps cumulé ≠ temps mural quand les agents sont parallèles · état vide d'un projet sans appel · rendu du graphique avec un seul point.

**✅ Acceptation** : total projet = somme des messages + appels hors tour (`memory_setup`) ; la répartition par phase se réconcilie avec le détail d'un tour ; la navigation clavier du graphique fonctionne (`accessibilityLayer` est actif par défaut dans `@mantine/charts`).

---

### P3 — Dashboard global, solde, annotations

**Objectif** : la vue transversale, et les indicateurs qui expliquent *ce qui fait évoluer le coût*.

| ID | Tâche | Taille |
|---|---|---|
| P3-1 | `GET /api/usage/report` — **un seul document** (totaux, série, projets, phases, modèles, fiabilité) | M |
| P3-2 | `GET /api/usage/provider-balance` via `ProviderStrategy.balance()`, cache TTL 5 min, `status: available \| unsupported` + raison | M |
| P3-3 | Entrée de navigation `/usage` (« Consommation », `IconCoins`) | S |
| P3-4 | Page dashboard : KPI, `LineChart` journalier, `BarChart` comparaison des projets, répartitions | L |
| P3-5 | Carte **solde fournisseur** — séparée, nommée, horodatée, jamais additionnée aux coûts mesurés | M |
| P3-6 | **Annotations du graphique** (`referenceLines` / `referenceAreas`) | M |
| P3-7 | Ajustement de la grille mobile : `repeat(4, …)` → `repeat(5, …)` + hauteur | S |

**P3-6 — annotations dérivées de l'usage observé.** Les marqueurs suivants se calculent **à partir de `llm_usage`**, sans nouvelle table :

- **`tour 20`** : repère vertical — le contexte narrateur est plafonné à 20 tours (`NARRATOR_CONTEXT_TURN_LIMIT`), la courbe doit y plafonner. Une croissance après ce point signale autre chose (mémoire, retries).
- **changement d'équipe** : première apparition d'un `agent_version_id` sur un projet, et disparition d'un agent qui n'apparaît plus → « 3ᵉ agent d'analyse activé au message 12 ».
- **régression de coût** : zone couvrant les tours régénérés (`regenerated_from_turn_id`) — dépense absente du chemin visible.

⚠️ **Limite à assumer** : `project_agent` est une table d'état courant, **sans historique**. Les marqueurs sont donc *déduits de l'usage observé*, pas de l'historique de configuration. Si un jour tu veux l'historique réel des équipes, c'est un changement distinct — je le mets en open decision plutôt que de le promettre ici.

**Tests** : DTO solde (disponible / non supporté / erreur fournisseur) · aucune fuite de clé · rapport global = somme des rapports projet · annotations dérivées correctement sur un jeu de fixtures.

**✅ Acceptation** : total global = somme des projets ; le solde est horodaté, libellé comme donnée fournisseur et présent dans aucun total ; un fournisseur sans endpoint affiche une explication, pas une erreur ; `App.test.tsx` couvre la nouvelle entrée de navigation.

---

### P4 — Insights et durcissement

| ID | Tâche | Taille |
|---|---|---|
| P4-1 | Détection des messages anormaux (coût > 3× la médiane de la branche) — badge discret | S |
| P4-2 | Estimation à la demande pour les appels `unpriced` disposant d'un `prompt` (caractères ÷ 4), **hors de `measuredMicroUsd`**, libellée « estimation » | M |
| P4-3 | Décision de rétention : permanence de `llm_usage` vs purge de `llm_call` | S |
| P4-4 | Décision sur l'historique antérieur à la mise en service (voir open decisions) | S |

---

## 3. TODO / ROADMAP à ajouter

À coller dans `TODO.md`, section `### Todo`, dans le format existant :

```markdown
- [ ] [MID][Back+Web] Cost & Usage Analytics P0 : collecte et tarification. Provider factory sous llm/providers (DeepSeek + compatible OpenAI), projectId obligatoire dans CallLLMInput, tables llm_usage et llm_price historisées, colonne llm_call.project_id, fixtures de tests et seed de démo. Prérequis des P1-P3.
- [ ] [MID][Back+Web] Cost & Usage Analytics P1 (MVP) : coût par message. Ligne discrète dans MessageList, routes d'usage par tour et par branche, colonne de coût dans la liste d'appels existante. Aucun drawer ni popover supplémentaire.
- [ ] [MID][Back+Web] Cost & Usage Analytics P2 : onglet Consommation du projet. Ajout de @mantine/charts et recharts 2.x, LineChart d'évolution, répartitions phases/agents/modèles en barres classées.
- [ ] [MID][Back+Web] Cost & Usage Analytics P3 : dashboard global /usage et solde fournisseur. Carte solde distincte des coûts calculés, annotations de graphique dérivées de l'usage observé (plafond de 20 tours, changement d'équipe, régénérations). Ajuster la grille de navigation mobile à 5 entrées.
- [ ] [MID][Back] [Après modèles par agent] Comparaison des coûts entre modèles : la dimension est déjà portée par llm_usage.model, l'UI attend que les modèles puissent être configurés par agent.
- [ ] [LOW][Back] Historique de configuration des équipes de projet (project_agent est un état courant sans historique) si les annotations de coût par changement d'agent doivent refléter la configuration réelle plutôt que l'usage observé.
```

---

## 4. Décisions ouvertes

### 4.1 Tes points 3.2 et 3.6

Tes deux commentaires « **3.2 Sur tes tables :** » et « **3.6** » sont arrivés sans contenu — je ne veux pas inventer ta remarque sur le modèle de données, qui est la partie la plus coûteuse à changer ensuite.

En attendant, voici les deux alternatives que je vois sur les tables, pour que tu puisses trancher :

| Option | Avantage | Coût |
|---|---|---|
| **A — grille tarifaire en table + `pricing_id` (recommandée)** | La tarification reste *identifiable* et réutilisable ; le coût reste explicable sans dupliquer les taux | Une jointure de plus, une table de référence |
| **B — taux instantanés sur la ligne d'usage** | Aucune jointure ; chaque ligne est une facture autonome | La tarification n'est plus « identifiable » ; dupliquer 3 nombres par appel ; pas de consultation de la grille |

### 4.2 Autres points que je recommande de trancher

| Sujet | Recommandation |
|---|---|
| Précision tarifaire DeepSeek | Le prix change selon l'heure (pleine/creuse). Grille simple, ou qualificateur `peak/off_peak` dès P0 ? |
| Historique antérieur à la mise en service | Ne rien backfiller : sans grille historisée, ce serait un recalcul rétroactif, interdit par tes principes. Script ponctuel explicite seulement. |
| Suppression de projet | `CASCADE` retenu (cohérent avec le reste du modèle) → l'historique comptable d'un projet supprimé disparaît. |
| Colonne `llm_call.project_id` | Recommandée : c'est ce qui rend une écriture comptable manquante réparable. |

---

Les points P0 et P1 sont conçus pour être implémentables sans revenir à l'investigation. Je peux enchaîner sur P0 dès que tu as tranché la section 4.

 

Ask User
Completed with input: {
  "message": "Deux de tes commentaires sont arrivés vides (« 3.2 Sur tes tables : » et « 3.6 ») et je préfère ne pas deviner sur la partie la plus coûteuse à changer ensuite. J'ai aussi besoin de confirmer l'arbitrage d'interface, puisque tes remarques 2.1 et 5.1 allaient dans deux directions différentes.",
  "requestedSchema": {
    "properties": {
      "tables_3_2": {
        "type": "string",
        "title": "3.2 — Sur mes tables",
        "description": "Ce que tu voulais dire sur le modèle de données (llm_usage + llm_price). Laisse vide si tu validais simplement, ou précise ta remarque."
      },
      "point_3_6": {
        "type": "string",
        "title": "3.6 — Contrats API",
        "description": "Ton commentaire sur les routes et DTO. Laisse vide si rien à signaler."
      },
      "interface": {
        "type": "string",
        "title": "Interface — quel arbitrage ?",
        "oneOf": [
          {
            "const": "onglet-projet",
            "title": "Onglet Consommation du projet + aucun drawer (recommandé)"
          },
          {
            "const": "drawer",
            "title": "Garder un drawer dédié aux coûts"
          },
          {
            "const": "autre",
            "title": "Autre — je précise"
          }
        ]
      },
      "tarification_deepseek": {
        "type": "string",
        "title": "Précision tarifaire DeepSeek",
        "description": "Le prix DeepSeek varie selon l'heure (pleine/creuse).",
        "oneOf": [
          {
            "const": "grille-simple",
            "title": "Grille simple par modèle (plus simple, coût approximatif)"
          },
          {
            "const": "pleine-creuse",
            "title": "Gérer pleine/creuse dès P0 (plus exact)"
          }
        ]
      }
    }
  }
}

Réponse directe à ta question, puis le plan mis à jour.

 

Fetched [https://api-docs.deepseek.com/quick_start/pricing](https://api-docs.deepseek.com/quick_start/pricing)
Completed with input: {
  "max_length": 6000,
  "url": "https://api-docs.deepseek.com/quick_start/pricing"
}

Searched the web for `Does the DeepSeek API expose an endpoint to read account usage or spend, not ...`
Completed with input: {
  "query": "Does the DeepSeek API expose an endpoint to read account usage or spend, not just balance?"
}

## Réponse à ta question : « combien exactement les requêtes ont coûté ? »

J'ai revérifié la source officielle. Réponse honnête, en trois points :

1. **DeepSeek ne renvoie aucun coût dans la réponse API.** Le schéma de `chat/completions` n'a pas de champ `cost`. La seule donnée disponible est `usage.prompt_tokens` / `completion_tokens` / `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`.
2. **DeepSeek n'expose aucun endpoint d'historique de dépense.** Seulement `GET /user/balance` : « DeepSeek's API does not expose period-to-date spend. The granted-vs-topped-up split is the only signal of how credits are being consumed. » Le solde est un instantané, pas une consommation par requête.
3. **Mais la formule est déterministe et c'est celle de DeepSeek :** « For model usage, the expense = number of tokens × price. »

Conclusion : **oui, on peut connaître le coût exact de chaque requête — en le calculant, pas en le demandant.** Et il est exact *si et seulement si* on applique le bon tarif, car :

| Tarif DeepSeek (`deepseek-flash`, USD / 1M tokens) | Heure creuse | Heure pleine |
|---|---|---|
| Input — cache hit | 0,003 | 0,006 |
| Input — cache miss | 0,15 | 0,30 |
| Output | 0,60 | 1,20 |

« Off-peak rates are half of the peak rates. Peak hours are 01:00–04:00 and 06:00–10:00 UTC, Monday through Friday, excluding Chinese public holidays. »

Le risque est donc **un facteur 2 silencieux sur la majorité des tokens** si on ignore la fenêtre. Et comme DeepSeek ne fournit ni coût par requête ni historique, **il n'existera jamais de moyen de réconciliation ou d'audit**. C'est exactement l'argument qui tranche ta question sur la précision : je recommande **pleine/creuse dès P0**, et tu viens de me confirmer que tu veux l'exactitude.

Le coût sera donc toujours étiqueté `basis: 'priced'` — **calculé par Choral Writer** — et jamais `'provider_confirmed'` sur DeepSeek. Le taux résolu est enregistré sur la ligne, ce qui rend le chiffre explicable a posteriori sans recalcul. Pas de forecast retenu. ✅

---

# Roadmap — Cost & Usage Analytics

## 0. Décisions actées

| # | Décision | Conséquence |
|---|---|---|
| D1 | **Deux niveaux seulement.** Aucun nouveau drawer, aucun popover. | La ligne discrète par message pointe vers l'onglet `Consommation` du projet. Le `TraceDrawer` existant n'est pas étendu en surface. |
| D2 | **`@mantine/charts` + `recharts` retenus.** | Le dashboard va grandir (agents, équipes, tour 1 vs 20, projets) : une librairie se justifie. Vérifié : `@mantine/charts@8.3.18` exige `@mantine/core@8.3.18` — **exactement** la version installée. |
| D3 | **Pas de domain `modules/usage`.** Le code vit sous `apps/api/src/llm/usage/`. | `llm/` possède déjà la frontière fournisseur ; la comptabilité en dépend. |
| D4 | **Factory de providers** sous `llm/providers/`. | Trois comportements réels à couvrir *aujourd'hui* (base URL libre). |
| D5 | **Comparaison entre modèles → ROADMAP** (après modèles par agent). | Données prévues, aucune UI. |
| D6 | **Projection/forecast → écarté.** **Budgets et alertes de seuil → écartés.** | Les limites *fournisseur* restent affichables dans la carte solde. |
| D7 | Tables `llm_usage` + `llm_price` **validées**. Contrats API **validés**. | — |
| D8 | **Tarification pleine/creuse dès P0.** | Exactitude du chiffre DeepSeek. Colonne `price_window` sur la grille. |

### Interface retenue

```text
Conversation (Récit)
  └─ ligne discrète par message          ← niveau 1, cliquable
        « 12,4 s · 0,021 $ · 4 220 tokens »
        ▼ lien réel, deep-linkable, pas de drawer
Onglet Consommation du projet            ← niveau 2
   ?tab=usage                       (vue projet + évolution)
   ?tab=usage&turn=<turnId>         (focus sur un message)
```

---

## 1. Architecture cible

### 1.1 Arborescence

```text
apps/api/src/
  llm/
    client.ts                 (existant — inchangé)
    call-llm.ts               (étendu : projectId requis + collecte des usages)
    index.ts                  (étendu : wiring recorder + strategy)
    providers/                ← NOUVEAU (factory)
      types.ts                    contrat ProviderStrategy
      deepseek.ts                 solde ✔ · cache ✔ · coût fournisseur ✘ · fenêtre peak/off-peak ✔
      openrouter.ts               coût fournisseur ✔ · solde ~ (clé de gestion)
      openaiCompatible.ts         repli : tokens seuls, solde non supporté
      index.ts                    createProviderStrategy(config)
    usage/                    ← NOUVEAU (domaine comptable, sous llm/)
      usageService.ts             record · report · turnDetail · balance
      pricingResolver.ts          résolution de grille + calcul (seul lieu qui manipule des montants)
      usageRepository.ts          une méthode SQL par besoin de rapport
      mappers/usageDto.ts
      controllers/usageController.ts
      routes/usageRoutes.ts
  db/entities/
    llmUsage.ts               ← NOUVEAU
    llmPrice.ts               ← NOUVEAU
  tests/fixtures/             ← NOUVEAU (P0)

packages/shared/src/
  usage/                      ← NOUVEAU, calqué sur src/chat/
    schemas/{usage,report,balance}.ts
    index.ts
    types.ts
```

Les **entités Drizzle restent dans `db/entities/`** (convention du projet, `llmCall.ts` y est déjà) ; la logique métier vit sous `llm/usage/`.

### 1.2 Contrat de la factory

```ts
export interface ProviderStrategy {
  readonly name: 'deepseek' | 'openrouter' | 'openai-compatible';
  /** Normalise les tokens, dont les champs de cache propres au fournisseur. */
  extractUsage(raw: unknown): {
    inputTokens: number | null; outputTokens: number | null; cachedInputTokens: number | null;
  };
  /** Coût renvoyé par le fournisseur lui-même, s'il existe (OpenRouter `usage.cost`). */
  providerCostUsd(raw: unknown): number | null;
  /** Fenêtre tarifaire applicable à cet instant ('all' si le fournisseur n'en a pas). */
  priceWindow(at: Date): 'peak' | 'off_peak' | 'all';
  /** Solde/crédits, ou raison explicite d'indisponibilité. */
  balance(): Promise<ProviderBalance>;
}
```

`createProviderStrategy(config)` sélectionne la stratégie via `LLM_PROVIDER` (`deepseek` | `openrouter` | `openai-compatible`), avec repli documenté par détection d'hôte de `LLM_BASE_URL`.

**Anti-YAGNI** : ce n'est pas de l'abstraction anticipée. Sans factory, les trois cas réels (cache DeepSeek, coût OpenRouter, tokens nus d'un endpoint compatible) s'éparpillent en conditions dans `call-llm.ts`. **Ajouter un provider supplémentaire reste hors-scope** : la factory isole les différences, elle n'en crée pas.

### 1.3 Modèle de données

```sql
CREATE TABLE choral_writer.llm_usage (
  id                  uuid PRIMARY KEY,
  call_id             uuid NOT NULL UNIQUE
                        REFERENCES choral_writer.llm_call(id) ON DELETE CASCADE,
  project_id          uuid NOT NULL
                        REFERENCES choral_writer.projects(id) ON DELETE CASCADE,
  turn_id             uuid,                       -- NULL pour memory_setup
  stage               text NOT NULL,
  stage_execution_id  uuid,
  agent_id            uuid,
  agent_version_id    uuid,
  provider            text NOT NULL,
  model               text NOT NULL,
  input_tokens        integer,
  output_tokens       integer,
  cached_input_tokens integer,
  duration_ms         integer NOT NULL,
  status              text NOT NULL,
  pricing_id          uuid REFERENCES choral_writer.llm_price(id),
  cost_basis          text NOT NULL,              -- provider_confirmed | priced | unpriced
  cost_micro_usd      bigint,                     -- NULL si unpriced
  currency            text NOT NULL DEFAULT 'USD',
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE choral_writer.llm_price (
  id                     uuid PRIMARY KEY,
  provider               text NOT NULL,
  model                  text NOT NULL,
  price_window           text NOT NULL DEFAULT 'all',   -- peak | off_peak | all
  input_per_million      numeric(18,6) NOT NULL,
  output_per_million     numeric(18,6) NOT NULL,
  cache_read_per_million numeric(18,6),
  valid_from             timestamptz NOT NULL,
  valid_to               timestamptz,
  source                 text NOT NULL
);

ALTER TABLE choral_writer.llm_call ADD COLUMN project_id uuid;
```

L'unicité d'une grille passe à `(provider, model, price_window, valid_from)`.

| Choix | Justification |
|---|---|
| Table séparée plutôt qu'étendre `llm_call` | `llm_call` stocke les prompts/réponses complets → rétention limitée par nature. Un coût doit être permanent. Un registre financier ne dépend pas de la politique de rétention d'un journal de débogage. |
| `project_id` **dénormalisé et obligatoire** | `llm_call.turn_id` n'a aucune FK et `memory_setup` n'a pas de tour : joindre via `chat_turn` perdrait des appels réellement facturés. |
| `llm_call.project_id` (nullable, nouvelles lignes) | Rend une ligne `llm_usage` manquante **réparable** : reconstruction idempotente via l'unicité sur `call_id`. |
| `turn_id` nullable, sans FK | Un tour annulé ne doit pas effacer la dépense. |
| Pas de `branch_id` | L'appartenance à une branche se déduit de l'ascendance ; `origin_branch_id` est une provenance, pas une appartenance. |
| `cost_micro_usd` bigint (micro-USD) | Sommes exactes en SQL, aucun flottant, unité dans le nom. Arrondi au niveau de l'appel. |
| `pricing_id` + grille immuable | Le coût reste **explicable** sans dupliquer les taux, et reste **figé**. Verrou par trigger, sur le précédent de `agent_version`. |
| `price_window` sur la grille | Seul moyen d'obtenir l'exactitude DeepSeek. Une grille sans fenêtre n'est pas auditable. |
| `cost_basis` à trois valeurs | Interdit structurellement de présenter une estimation comme un coût réel. Sur DeepSeek : toujours `priced`. |

Index : `(project_id, created_at)`, `(project_id, stage)`, `(turn_id)`, `(model)`, plus l'unicité `call_id`.

**Pas de table d'agrégation, pas de vue matérialisée.** 4 à 12 appels par message ; 10 000 messages ≈ 100 000 lignes. Le repository de chat fait déjà des CTE récursives à la demande.

---

## 2. Plan d'implémentation

Légende : **S** ≈ ½ journée · **M** ≈ 1–2 jours · **L** ≈ 3 jours et plus.

### P0 — Fondations : collecte, tarification, fixtures

**Objectif** : chaque appel produit une ligne de registre fiable et tarifée. Phase irréversible, aucune UI.

| ID | Tâche | Taille |
|---|---|---|
| P0-1 | `LLM_PROVIDER` dans `config.ts` + `.env.example` + `llm/providers/` (factory, 3 stratégies, `priceWindow`) | M |
| P0-2 | `projectId` **obligatoire** dans `CallLLMInput` ; threadé aux 5 sites d'appel (analyse, narrateur, gardien, `memory_setup`, `MemorySession`) | S |
| P0-3 | Extraction tokens (dont cache) + coût fournisseur + fenêtre tarifaire dans `call-llm.ts` | S |
| P0-4 | Entités `llmUsage` / `llmPrice` + migration (tables, index, trigger d'immuabilité, colonne `llm_call.project_id`, seed tarifaire **peak + off_peak** `source='provider-docs'`) | M |
| P0-5 | `pricingResolver.ts` (résolution `(provider, model, window, at)`) + `usageRepository.insert` + `usageService.record` | M |
| P0-6 | Wiring dans `llm/index.ts` ; **écriture en `try/catch` séparé** — bruyant, mais ne détruit pas une narration réussie | S |
| P0-7 | **Fixtures** (`tests/fixtures/`) : usine à projets/tours/`llm_call`/`llm_usage`, ids injectables, réutilisable par `chat.integration.test.ts` | M |
| P0-8 | **Seed de démo** : script générant un projet de démonstration avec N tours et une conso plausible (heures pleines et creuses mêlées) | M |

**P0-7 / P0-8 — pourquoi en P0.** Sans fixtures, P1→P3 ne sont ni testables ni démontrables, et la base de dev est trop pauvre pour concevoir un dashboard. Le seed permet de **voir l'UI avant d'avoir brûlé des tokens réels**, et les fixtures deviennent la base commune des tests d'agrégation. Garde-fous : refus d'exécution si `NODE_ENV=production`, projet explicitement nommé.

**Tests** : résolution de grille (fenêtres, chevauchement, absence → `unpriced`) · sélection de base (coût fournisseur → `provider_confirmed` ; tokens + grille → `priced` ; tokens nuls → `unpriced`) · **résolution pleine vs creuse sur des timestamps de part et d'autre des bornes** · calcul cache hit/miss et arrondi · `call-llm` étendu (cache capturé, coût OpenRouter capturé, recorder appelé avec le `callId`, échec du recorder n'échoue pas l'appel) · intégration PostgreSQL : un tour produit exactement une ligne par `llm_call`, `memory_setup` inclus avec `turn_id` null.

**✅ Acceptation** : après un tour réel en dev, `SELECT count(*) FROM llm_usage WHERE turn_id = …` égale le nombre de traces du tour ; chaque ligne porte un `project_id` ; le coût d'un appel `deepseek-flash` hors heures pleines vaut bien la moitié du même appel en heures pleines ; `pnpm test`, `pnpm typecheck` verts ; le seed produit un jeu exploitable.

---

### P1 — MVP : le coût d'un message, dans la conversation

**Objectif** : répondre à « combien coûte ce message et pourquoi » sans quitter le récit.

| ID | Tâche | Taille |
|---|---|---|
| P1-1 | DTO partagés dans `packages/shared/src/usage/` | S |
| P1-2 | `usageService.turnDetail` + routes `GET …/turns/:turnId/usage` et `GET …/branches/:branchId/usage/turns` | M |
| P1-3 | `pathIds()` extrait de `ChatTurnRepository.path()` — **une seule source de vérité** sur l'ascendance, composée par le service d'usage | S |
| P1-4 | `api/usage/usageApi.ts` + `hooks/useConversationUsage.ts` / `useTurnUsage.ts` (rechargement sur changement de `headTurnId`) | M |
| P1-5 | `components/usage/usageFormat.ts` — **formate, ne calcule jamais** | S |
| P1-6 | **Ligne niveau 1** dans `MessageList.tsx` : `12,4 s · 0,021 $ · 4 220 tokens`, lien `?tab=usage&turn=<turnId>`, nom accessible complet | M |
| P1-7 | Colonne de coût dans la liste d'appels **existante** du `TraceDrawer` (amélioration d'un écran connu, pas une surface nouvelle) | S |

**Tests** : mapper/DTO · hook (chargement, erreur, vide, annulation) · `MessageList` affiche la ligne et pointe la bonne URL · formatage · accessibilité · revue : **aucune somme monétaire côté front**.

**✅ Acceptation** : chaque message terminé affiche durée · coût · tokens ; un appel `unpriced` est visible et **jamais compté comme 0 $** ; mobile 360 px sans débordement ; aucun drawer ni popover ajouté.

---

### P2 — Reporting projet (onglet Consommation)

**Objectif** : la vue par projet, premières réutilisations de graphiques.

| ID | Tâche | Taille |
|---|---|---|
| P2-1 | `GET /api/projects/:projectId/usage/report` (synthèse, série par message, phases, agents, modèles, essais abandonnés, fiabilité) | M |
| P2-2 | Dépendances : `@mantine/charts@8.3.18`, `@mantine/hooks@8.3.18`, `recharts@^2.15.4` | S |
| P2-3 | Import `@mantine/charts/styles.css` dans `main.tsx`, **après** `@mantine/core/styles.css` | S |
| P2-4 | Onglet `Consommation` (`?tab=usage`) via `ConfigurationWorkspace` / `ConfigurationSection` | M |
| P2-5 | **`LineChart`** : évolution du coût par message, cliquable → focus sur le message | M |
| P2-6 | Répartition phases / agents / modèles : rangées + `Progress` (pas de camembert — illisible pour comparer) | S |

**Note dépendances** : `@mantine/charts@8.3.18` exige `@mantine/core@8.3.18` **exactement** — la version installée correspond. `recharts` doit être **épinglé en 2.x** : la 3.x est publiée mais Mantine 8 documente et teste la 2.x. `@mantine/hooks` est présent en transitif mais **non hoisté** dans `apps/web/node_modules` → à déclarer explicitement.

**Tests** : somme des lignes niveau 1 = total du rapport (intégration) · temps cumulé ≠ temps mural quand les agents sont parallèles · état vide d'un projet sans appel · rendu avec un seul point.

**✅ Acceptation** : total projet = somme des messages + appels hors tour (`memory_setup`) ; la répartition par phase se réconcilie avec le détail d'un tour ; navigation clavier du graphique fonctionnelle (`accessibilityLayer` actif par défaut dans `@mantine/charts`).

---

### P3 — Dashboard global, solde, annotations

**Objectif** : la vue transversale et les indicateurs qui expliquent *ce qui fait évoluer le coût*. C'est ici que la librairie de graphiques paie.

| ID | Tâche | Taille |
|---|---|---|
| P3-1 | `GET /api/usage/report` — **un seul document** (totaux, série, projets, phases, modèles, fiabilité) | M |
| P3-2 | `GET /api/usage/provider-balance` via `ProviderStrategy.balance()`, cache TTL 5 min, `status: available \| unsupported` + raison | M |
| P3-3 | Entrée de navigation `/usage` (« Consommation », `IconCoins`) | S |
| P3-4 | Page dashboard : KPI, `LineChart` journalier, `BarChart` comparaison des projets, répartitions | L |
| P3-5 | Carte **solde fournisseur** — séparée, nommée, horodatée, jamais additionnée aux coûts mesurés | M |
| P3-6 | **Annotations du graphique** (`referenceLines` / `referenceAreas`) | M |
| P3-7 | Grille mobile : `repeat(4, …)` → `repeat(5, …)` + hauteur | S |

**P3-6 — annotations dérivées de l'usage observé**, sans nouvelle table :

- **`tour 20`** : repère vertical — le contexte narrateur est plafonné à `NARRATOR_CONTEXT_TURN_LIMIT = 20`. La courbe doit y plafonner ; une croissance après ce point signale autre chose (mémoire, retries).
- **changement d'équipe** : première apparition d'un `agent_version_id` sur un projet → « 3ᵉ agent d'analyse activé au message 12 ».
- **régression de coût** : zone couvrant les tours régénérés (`regenerated_from_turn_id`) — dépense absente du chemin visible.

⚠️ **Limite assumée** : `project_agent` est un état courant **sans historique**. Les marqueurs sont *déduits de l'usage observé*, pas de l'historique de configuration. L'historique réel est une décision ouverte (voir §4).

**Tests** : DTO solde (disponible / non supporté / erreur fournisseur) · aucune fuite de clé · rapport global = somme des rapports projet · annotations correctes sur fixtures.

**✅ Acceptation** : total global = somme des projets ; le solde est horodaté, libellé comme donnée fournisseur, et présent dans aucun total ; un fournisseur sans endpoint affiche une explication, pas une erreur ; `App.test.tsx` couvre la nouvelle entrée.

---

### P4 — Insights et durcissement

| ID | Tâche | Taille |
|---|---|---|
| P4-1 | Messages anormaux (coût > 3× la médiane de la branche) — badge discret | S |
| P4-2 | Estimation à la demande pour les appels `unpriced` disposant d'un `prompt` (caractères ÷ 4), **hors de `measuredMicroUsd`**, libellée « estimation » | M |
| P4-3 | Rétention : permanence de `llm_usage` vs purge de `llm_call` | S |
| P4-4 | Historique antérieur à la mise en service (voir §4) | S |

---

## 3. TODO / ROADMAP à ajouter

À coller dans `TODO.md`, section `### Todo`, dans le format existant :

```markdown
- [ ] [MID][Back+Web] Cost & Usage Analytics P0 : collecte et tarification. Provider factory sous llm/providers (DeepSeek + compatible OpenAI), projectId obligatoire dans CallLLMInput, tables llm_usage et llm_price historisées avec fenêtre pleine/creuse, colonne llm_call.project_id, fixtures de tests et seed de démo. Prérequis des P1-P3.
- [ ] [MID][Back+Web] Cost & Usage Analytics P1 (MVP) : coût par message. Ligne discrète dans MessageList, routes d'usage par tour et par branche, colonne de coût dans la liste d'appels existante. Aucun drawer ni popover supplémentaire.
- [ ] [MID][Back+Web] Cost & Usage Analytics P2 : onglet Consommation du projet. Ajout de @mantine/charts et recharts 2.x, LineChart d'évolution, répartitions phases/agents/modèles.
- [ ] [MID][Back+Web] Cost & Usage Analytics P3 : dashboard global /usage et solde fournisseur. Carte solde distincte des coûts calculés, annotations de graphique dérivées de l'usage observé (plafond de 20 tours, changement d'équipe, régénérations). Ajuster la grille de navigation mobile à 5 entrées.
- [ ] [MID][Back] [Après modèles par agent] Comparaison des coûts entre modèles : la dimension est déjà portée par llm_usage.model, l'UI attend que les modèles puissent être configurés par agent.
- [ ] [LOW][Back] Historique de configuration des équipes de projet (project_agent est un état courant sans historique) si les annotations de coût par changement d'agent doivent refléter la configuration réelle plutôt que l'usage observé.
```

---

## 4. Décisions ouvertes restantes

| Sujet | Recommandation |
|---|---|
| Historique antérieur à la mise en service | Ne rien backfiller : sans grille historisée, ce serait un recalcul rétroactif — interdit par tes principes. Script ponctuel explicite seulement. |
| Suppression de projet | `CASCADE` retenu (cohérent avec le reste du modèle) → l'historique comptable d'un projet supprimé disparaît. |
| Historique des équipes | Non requis si les annotations restent dérivées de l'usage observé. À ouvrir seulement si tu veux l'historique réel (cf. TODO LOW). |
