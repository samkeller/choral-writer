# Développement

## Prérequis et démarrage

- Node.js LTS, pnpm 12 et Docker Desktop pour la base de données locale.
- À la racine : copier `.env.example` vers `.env`, renseigner les valeurs locales, puis lancer `pnpm install`.
- Démarrer PostgreSQL avec `docker compose up -d` si nécessaire et appliquer les migrations avec `pnpm db:migrate`.
- `pnpm dev` démarre l'API et Vite. Le frontend est servi sur le port `5175`; Vite relaie `/api` et `/healthz` vers `http://127.0.0.1:<PORT>`, où `PORT` vaut `3001` par défaut.

Après une mise à jour ou un changement de branche qui ajoute des migrations,
réexécuter `pnpm db:migrate` avant `pnpm dev`. Le serveur ne migre pas la base
automatiquement ; une ancienne structure peut rendre les endpoints incompatibles.

## Workspaces et scripts

Le repository pnpm contient `apps/web` (React/Vite), `apps/api` (Fastify) et `packages/shared` (contrats et validation partagés). Les scripts racine coordonnent les workspaces :

| Commande | Utilité |
| --- | --- |
| `pnpm dev` | Démarre l'API et le frontend en parallèle |
| `pnpm build` | Construit `shared`, l'API puis le frontend |
| `pnpm typecheck` | Vérifie les types des packages et applications |
| `pnpm test` | Exécute les tests de l'API et du frontend avec Vitest |

Commandes frontend ciblées :

| Commande | Utilité |
| --- | --- |
| `pnpm --filter @choral-writer/web dev` | Lance Vite seul (l'API doit être démarrée séparément) |
| `pnpm --filter @choral-writer/web build` | Typecheck frontend puis build Vite |
| `pnpm --filter @choral-writer/web typecheck` | Vérifie TypeScript du frontend |
| `pnpm --filter @choral-writer/web test` | Exécute les tests Vitest du frontend |

Le frontend utilise React 19, TypeScript, Vite, React Router 7, Mantine 8 et Tabler Icons. Les versions effectivement résolues sont enregistrées dans `pnpm-lock.yaml`.

## Variables d'environnement

Les variables d'exemple dans `.env.example` sont destinées au développement et ne sont pas des secrets à déployer :

- `PORT` configure le port de l'API ciblé par le proxy Vite.
- `DATABASE_URL`, `APP_PASSWORD`, `COOKIE_SECRET`, `LLM_API_KEY`, `LLM_BASE_URL` et `LLM_MODEL` sont utilisées par l'API.
- `NODE_ENV` configure l'environnement de l'API.
- Le navigateur appelle l'API par le chemin relatif `/api`; aucune variable `VITE_*` n'est requise par le frontend actuellement.

Ne jamais committer de secrets. L'API et le frontend conservent leurs scripts et dépendances dans leurs manifestes respectifs.

## Instructions pour les agents

Lire [`apps/web/AGENTS.md`](../apps/web/AGENTS.md) pour les consignes frontend et [`FRONTEND_CONVENTIONS.md`](./web/FRONTEND_CONVENTIONS.md) pour l'organisation des changements UI.

## Domaines et responsabilités

Le domaine conversationnel utilise le préfixe SQL `chat_` et les dossiers
`modules/chat`, `db/entities/chat` et `packages/shared/src/chat`.
Voir [CHAT.md](./api/CHAT.md) pour les décisions, les invariants, la migration
M2.1 et les conséquences pour la mémoire future.

Dans le chat, les routes délèguent aux contrôleurs pour la validation et le transport ;
les services portent les cas d'usage et collaborent entre eux ;
chaque repository encapsule la persistance de son entité.
Les entités Drizzle décrivent les données et contraintes, pas l'orchestration.
Le front sépare transport API, état applicatif dans les hooks et rendu des composants.
Éviter les couches ou interfaces génériques sans besoin concret.

Documenter en JSDoc les frontières et invariants non évidents : sens d'une entité,
préconditions, mutations, transactions et distinction entre résultat provisoire
et état persistant. Ne pas répéter les types ou commenter mécaniquement chaque
fonction. Les décisions transversales et limites connues vont dans la documentation.

## Tests PostgreSQL

Les tests d'intégration sont activés uniquement avec `TEST_DATABASE_URL` vers une
base PostgreSQL jetable, puis `pnpm test`. Ils appliquent les migrations et créent
leurs propres projets ; ne jamais utiliser une base de production. Les appels LLM
sont simulés. Sans cette variable, Vitest signale ces tests comme ignorés.
