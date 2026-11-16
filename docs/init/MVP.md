# Choral Writer: Conception MVP (v0)

## 1. Vision

Choral Writer est un moteur d'histoires à long terme. Plusieurs agents LLM configurables analysent chaque tour sous des angles différents, puis un narrateur écrit la suite. Les mémoires sont structurées, tracées et corrigeables.

L'utilisateur est un **metteur en scène** : il écrit « Pierre demande à Marie si elle veut bien… », impose l'action d'un ou plusieurs personnages et laisse le reste du monde libre de réagir. Le récit est à la troisième personne. Un tour produit une à deux pages, qui peuvent couvrir quelques minutes ou plusieurs mois selon la demande.

**Principes**

1. **Le LLM exprime, le code fait autorité.** Les agents proposent, le code valide et écrit.
2. **Le journal est la vérité.** Tout changement est un événement ajouté à un journal. L'état courant en est une projection reconstructible.
3. **Orchestrateur déterministe.** Le pipeline est fixe, aucun LLM ne décide de l'enchaînement.
4. **Un appel par agent et par tour.** Pas de dialogue libre entre agents.
5. **Asymétrie d'information.** Chaque agent ne reçoit que la vue de contexte déclarée dans sa configuration.
6. **Tout est tracé.** Chaque appel LLM est stocké.
7. **Faits et résumés sont séparés.** Les faits critiques vivent en données structurées. Les résumés ne servent qu'au fil et au ton.

**Moteur et configuration.** Le moteur ne connaît que trois sortes d'agents : interpréteur, analyse, sortie. Un agent d'analyse est une donnée, définie par son prompt, son modèle, sa vue de contexte et son planning. Le moteur ne dépend ni de son nom ni de son rôle. Tags et types d'entités sont du texte libre, propre à chaque histoire.

## 2. Fonctionnel

- Un projet correspond à une histoire.
- **Setup** : un system prompt `world.md` (en db) (monde, personnages, règles, style) et des agents liés (en db également).
- **Tour** : l'utilisateur saisit un texte, plus une direction méta facultative (« j'aimerais qu'on aille vers un conflit »). Le récit arrive en streaming.
- **Mode debug** : interprétation, contributions de chaque agent, propositions acceptées ou rejetées, coût et latence. Il permet aussi de corriger les mémoires, relancer le gardien et revenir à un tour antérieur.
- **Mémoire** : des faits, des connaissances par personnage (y compris des croyances fausses) et des résumés hiérarchiques automatiques.
- Accès par mot de passe unique, interface web responsive (mobile first).

## 3. Pipeline d'un tour

```
Saisie
  │
  ▼
[0] Interpréteur ── interprétation structurée
  │
  ▼
[1] ÉTAGE ANALYSE : N agents en parallèle, isolés
      │  chacun écrit une enveloppe sur le whiteboard
  ▼
[2] ÉTAGE SORTIE
      Narrateur (streaming) : lit tout le whiteboard → résolution + prose
      Gardien : lit whiteboard + résolution + prose → propositions mémoire
  ▼
[3] Réducteur (code) : valide, écrit événements et projection
```

L'utilisateur lit pendant que le gardien travaille, et le tour suivant attend la fin du réducteur. Pour un tour de 30 s environ, le chemin visible est l'interpréteur, l'analyse et le narrateur.

### 3.1 Interpréteur
Un modèle bon marché normalise la saisie en JSON validé :
- personnages pilotés par l'utilisateur et actions imposées ;
- issues présupposées (« Pierre convainc Marie »), traitées comme **intentions** et non comme faits ;
- entités concernées ;
- échelle de temps demandée (moment, jours, mois…) ;
- direction méta.

En cas d'échec, on transmet la saisie brute.

### 3.2 Étage analyse
- Exécution en parallèle, avec timeout par agent.
- Un agent reçoit l'interprétation et sa vue de contexte. Il ne voit ni le whiteboard ni les autres agents.
- Il retourne une **enveloppe** (section 4.1).
- Planning configurable par agent : toujours, quand une entité est concernée, tous les N tours, sur saut temporel.
- Un agent en échec est ignoré, sauf s'il est marqué `required`.

### 3.3 Narrateur
Un seul appel en streaming qui lit le whiteboard complet. Sa sortie est délimitée par des balises :

```
<resolution>
{ "happened": [{ "text": "...", "participants": ["pierre","marie"], "location": "taverne" }],
  "time": { "label": "Soir du troisième jour", "elapsed_days": 0.1 } }
</resolution>
<prose> … 1 à 2 pages … </prose>
```

Le serveur valide `resolution` dès qu'elle est fermée, puis streame `prose`. Le narrateur est libre sur la forme (style, dialogues, détails) et lié sur les faits. Ordre de priorité inscrit dans son prompt :
1. faits critiques et contraintes ;
2. décisions des personnages autonomes, y compris leurs refus ;
3. complications proposées ;
4. direction méta (simple suggestion).

### 3.4 Gardien
Un seul appel après le narrateur. Il lit le whiteboard (dont les suggestions `remember`), la résolution et la prose, puis produit des **propositions** typées (section 4.2). Il décide ce qui est mémorisé, pour qui, et ce qui est volontairement oublié.

### 3.5 Réducteur
Code pur. Il valide chaque proposition, écrit les événements et met à jour la projection dans une transaction. Chaque rejet est journalisé avec un code.

Le contexte contient les résumés non couverts par le niveau supérieur plus les événements bruts récents.

## 4. Contrats

### 4.1 Enveloppe des agents d'analyse
```ts
Envelope = {
  analysis: string,        // conclusions en langage naturel
  constraints: string[],   // ce que le narrateur doit respecter
  notes: string[],         // observations, idées, signalements
  remember: { text: string, about?: string[], importance?: LOW|MEDIUM|HIGH }[]  // suggestions pour le gardien
}
```

### 4.2 Propositions du gardien

| `op` | Rôle | Champs principaux |
|---|---|---|
| `create_entity` | Nouvelle entité | key, name, kind (libre), description, attributes |
| `update_entity` | Modifier une entité | key, patch, reason |
| `add_fact` | Nouveau fait atomique | text, subjects[], tags[] (libres), importance LOW|MEDIUM|HIGH, public, known_by[] |
| `supersede_fact` | Remplacer ou retirer un fait | ref, new_text?, reason |
| `set_knowledge` | Qui sait, croit ou soupçonne quoi | character, fact_ref ou content, status, is_false |

Chaque proposition porte une courte `source_quote` tirée du texte, pour l'audit.

### 4.3 Règles du réducteur
- Format valide (Zod).
- Les clés d'entités et les refs de faits référencées existent.
- `create_entity` est rejeté si la clé existe déjà.
- Pas de doublon de fait actif (même texte normalisé).
- Remplacer un fait d'importance HIGH exige une `reason` et un événement de la résolution qui le justifie.
- Un fait non public doit avoir au moins un personnage dans `known_by`.
- Seuls le gardien, le seed et le debug peuvent proposer.

### 4.4 Visibilité
- Un fait **public** est connu de tous.
- Un fait **non public** n'est connu que des personnages qui ont une ligne `knowledge` dessus.
- Le narrateur et le gardien voient tout. Les agents d'analyse voient ce que leur vue de contexte autorise.
- Pour le narrateur, le code ajoute un bloc « ne doit pas être révélé à » (faits non publics du focus que le personnage ne connaît pas).

**Exemple.** Léon a tué le baron, et Marie croit que c'est Hugo.
- `facts` : « Léon a tué le baron » (non public, importance HIGH).
- `knowledge` : (Léon, ce fait, `knows`) et (Marie, ce fait, `believes`, `is_false`, contenu « Hugo a tué le baron »).
- L'agent de Marie ne reçoit que sa ligne de croyance, et Pierre ne reçoit rien.

## 5. Contexte des agents

Chaque agent déclare sa vue :

```yaml
context:
  max_input_tokens: 6000
  rules: true                 # faits tagués règle du monde
  facts: { importance_min: 3, about: focus }
  entities: focus             # none | focus | all | liste de clés
  knowledge_of: [marie]
  events: { last: 8 }
  summaries: [1, 2]
  recent_prose: 1
  whiteboard: false           # true pour les agents de sortie
```

**Focus** (calculé par le code) : entités de l'interprétation, personnages du même lieu que les personnages pilotés, participants du dernier tour.

**Ordre d'assemblage du prompt**, pensé pour le cache de préfixe, du plus stable au plus variable :
1. instructions globales (db, format .md) ;
2. instructions du projet (style, ton, focalisation) ;
3. prompt de l'agent et schéma de sortie ;
4. règles du monde ;
5. état, connaissances, résumés, événements, prose récente ;
6. saisie interprétée et whiteboard (agents de sortie).

## 6. Schéma de base de données (PostgreSQL)

```sql
projects (id, name, instructions, world_md, settings jsonb, story_clock_days, last_event_seq, created_at)

agents (id, project_id, key, name,
        kind check in ('interpreter','analysis','output'),
        system_prompt, model, params jsonb,        -- temperature, max_tokens, timeout
        context_spec jsonb, schedule jsonb,
        required bool, enabled bool,
        unique (project_id, key))

turns (id, project_id, seq, user_input, meta_direction,
       status,                                     -- pending|interpreting|analyzing|narrating|narrated|guarding|committed|failed
       interpretation jsonb, resolution jsonb, prose,
       story_time_label, elapsed_days, error, created_at, committed_at,
       unique (project_id, seq))
branches (id, project_id, parent_branch_id, fork_event_seq, created_at,
         unique (project_id, parent_branch_id, fork_event_seq))

whiteboard_entries (id, turn_id, agent_id, envelope jsonb, status, call_id)

llm_calls (id, project_id, turn_id, agent_id, purpose, model,
           messages jsonb, response, input_tokens, cached_tokens, output_tokens,
           cost_usd, latency_ms, status, error, created_at)

-- Journal : source de vérité
events (id, project_id, seq,                       -- séquence par projet
        turn_id, category check in ('narrative','mutation'),
        type, payload jsonb, participants uuid[], source,  -- seed|narrator|guardian|debug
        created_at, unique (project_id, seq))

-- Projection (reconstructible depuis events)
entities (id, project_id, key, name, kind text, aliases text[],
          description, attributes jsonb,
          created_event, updated_event, unique (project_id, key))

facts (id, project_id, ref int,                    -- identifiant court affiché aux LLM
       subjects uuid[], text, tags text[],
       importance int check (importance between 1 and 3),
       public bool,
       status check in ('active','superseded','retracted'),
       created_event, superseded_event, superseded_by,
       unique (project_id, ref))

knowledge (id, project_id, character_id, fact_id null, content,
           status check in ('knows','believes','suspects'), confidence,
           is_false bool, source_event, ended_event)

summaries (id, project_id, level, from_turn, to_turn, text, source_ids uuid[], created_at)

proposals (id, project_id, turn_id, author, op, payload jsonb,
           status, reject_code, reject_detail, event_seq)
```

_Ces tables et leurs propriétés évolueront au fil du temps nécessairement.

**Notes**
- Les faits et connaissances ne sont jamais modifiés sur place : on clôt l'ancienne ligne et on en insère une nouvelle, donc l'historique reste complet.
- La position, l'état et les relations d'un personnage sont des faits ou des attributs, pas des colonnes dédiées.
- Les LLM manipulent des **clés** (`pierre`) et des **refs** (`F123`), jamais des UUID.
- Le retour en arrière fait une nouvelle branche à partir de l'état ciblé, puis reconstruit la projection par rejeu des événements `mutation`. L'autre branche doit toujours être accessible.
- Un verrou par projet garantit un seul tour actif.

## 7. Temps
Le temps est narratif. Le narrateur fournit un libellé libre et une durée estimée en jours, que le code cumule dans `story_clock_days`. Cette valeur sert à déclencher les agents planifiés « sur saut temporel » et la compaction.

## 8. Setup du monde

`world_md` est un Markdown structuré par titres (pitch, style, règles, personnages, lieux, faits initiaux). À la création du projet :

1. Un appel « initialiseur » transforme le fichier en propositions (mêmes `op` que le gardien).
2. Le réducteur les valide avec `source = seed`.
3. En debug, tu peux relire et corriger avant validation.

Potentiellement, que cet agent initiateur pourrait aussi proposer quels agents créer.

Ensuite, la **projection en base fait foi**, et `world_md` est conservé comme archive. Les sections Pitch et Style alimentent `projects.instructions`.

**Hiérarchie des instructions** : `config/global.md` + instructions du projet + prompt de l'agent, concaténés dans cet ordre.

## 9. Stack

| Domaine | Choix |
|---|---|
| Runtime | Node, TypeScript strict |
| Serveur | Fastify (REST + SSE) |
| Base | PostgreSQL (Railway), migrations Drizzle |
| Validation | Zod |
| LLM | Client maison sur API compatible OpenAI (OpenRouter, DeepSeek) |
| Front | React + Vite, responsive |
| Auth | Mot de passe unique en variable d'environnement, cookie signé |
| Tests | Vitest, client LLM simulé |
| Structure | Monorepo pnpm : `packages/engine` (logique pure), `apps/server`, `apps/web` |

**Client LLM** : `complete({ model, messages, schema?, stream?, maxTokens, temperature })`. Il gère timeout, retry avec backoff, une réparation si la sortie échoue la validation Zod, et trace chaque appel dans `llm_calls`.

## 10. API

| Méthode | Route | Rôle |
|---|---|---|
| POST | `/api/login` | Mot de passe |
| POST | `/api/projects` | Crée un projet (`world.md` + `agents.yaml`) |
| GET | `/api/projects/:id` | Config et état |
| POST | `/api/projects/:id/turns` | Lance un tour (réponse SSE) |
| GET | `/api/projects/:id/turns` | Liste des tours |
| GET | `/api/turns/:id/debug` | Interprétation, whiteboard, appels, propositions |
| GET | `/api/projects/:id/memory` | Entités, faits, connaissances, résumés |
| POST | `/api/projects/:id/debug/proposals` | Correction manuelle, via le réducteur |
| POST | `/api/projects/:id/rewind` | Retour à un tour |
| PUT | `/api/agents/:id` | Édition d'un agent |
| POST | `/api/turns/:id/retry-guardian` | Relance du gardien |

_Ces endpoints sont indicatifs et peuvent évoluer. On préfère plusieurs petites routes spécialisées plutôt qu'une seule route générique._

## 11. Robustesse, coût, tests

- **États d'un tour** : `pending → interpreting → analyzing → narrating → narrated → guarding → committed` (ou `failed`). Chaque étape persiste son résultat, donc un tour est reprenable.
- **Échecs** : si le narrateur échoue après un retry, le tour échoue et rien n'est écrit. Si le gardien échoue, le tour reste `narrated` et le suivant est bloqué jusqu'à la relance.
- **Coût** : environ 6 à 8 appels par tour. Un budget par tour et par projet est configurable. Les ordres de grandeur sont à mesurer avec `llm_calls` (cf. debug mode).
- **Tests unitaires** : réducteur, rejeu des événements, context builder (isolation, visibilité, troncature).
- **Test d'intégration** : un tour complet avec client simulé.
- **Test de cohérence manuel** : environ 30 tours avec des faits posés dès le début (une main perdue, une porte verrouillée sans clé, un secret ignoré d'un personnage, un refus attendu), en poussant volontairement le système à les contredire.

## 12. Jalons

| Jalon | Contenu | Résultat testable |
|---|---|---|
| **M0 Socle** | Monorepo, migrations, client LLM avec traces, auth | Un appel LLM tracé en base |
| **M1 Tour minimal** | Interpréteur, narrateur, SSE, UI de récit | Itérer sur les prompts du narrateur |
| **M2 Mémoire** | Schéma complet, import du monde, réducteur, gardien, context builder | Les faits posés sont respectés |
| **M3 Analyse** | Whiteboard, agents parallèles configurables | Les personnages refusent et divergent |
| **M4 Debug** | Tiroir debug, navigateur de mémoire, corrections, rewind et branches de récit | Corriger une erreur de mémoire sans SQL |
| **M5 Production** | Railway, mobile, suivi des coûts | Utilisable au quotidien |

## Annexe : exemple d'agent (non normatif)

```yaml
- key: marie
  name: Marie
  kind: analysis
  model: deepseek-chat
  schedule: { mode: when_entity_involved, entity: marie }
  params: { temperature: 0.9, max_tokens: 800, timeout_ms: 25000 }
  context: { entities: [marie], knowledge_of: [marie], events: { last: 6 }, summaries: [1] }
  system_prompt: |
    Tu incarnes Marie. Tu ne connais que ce que tes connaissances indiquent.
    Tu peux refuser, te tromper ou poursuivre tes propres objectifs.
```

Les autres agents d'analyse (arbitre de faisabilité, dramaturge, simulateur des absents, vérificateur de cohérence) s'écrivent de la même façon : seuls le prompt, la vue de contexte et le planning changent.