# Développement

## Prérequis et démarrage

- Node.js LTS, pnpm 12 et Docker Desktop pour la base de données locale.
- À la racine : copier `.env.example` vers `.env`, renseigner les valeurs locales, puis lancer `pnpm install`.
- Démarrer PostgreSQL avec `docker compose up -d` si nécessaire et appliquer les migrations avec `pnpm db:migrate`.
- `pnpm dev` démarre l'API et Vite. Le frontend est servi sur le port `5175`; Vite relaie `/api` et `/healthz` vers `http://127.0.0.1:<PORT>`, où `PORT` vaut `3001` par défaut.

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

Lire [`apps/web/AGENTS.md`](../apps/web/AGENTS.md) pour les consignes frontend et [`FRONTEND_CONVENTIONS.md`](./FRONTEND_CONVENTIONS.md) pour l'organisation des changements UI.
