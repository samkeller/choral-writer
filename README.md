# Choral Writer

Application de récit à la troisième personne : interprétation, agents d'analyse isolés, narration en streaming puis propositions de mémoire validées par le code. PostgreSQL conserve les appels, propositions, événements et projections ; les branches sont accessibles après un retour en arrière.

## Prérequis

- Node.js LTS
- pnpm 12
- Docker Desktop (pour le PostgreSQL local)

## Démarrage local

1. Copier `.env.example` vers `.env`, puis renseigner le mot de passe, un secret de cookie d'au moins 32 caractères et les identifiants du fournisseur LLM.
2. (facultatif) Démarrer PostgreSQL avec `docker compose up -d`.
3. Installer les dépendances avec `pnpm install`.
4. Appliquer les migrations avec `pnpm db:migrate`.
5. Démarrer l'API et le front avec `pnpm dev`, puis ouvrir l'URL Vite affichée dans le terminal.

## Base de données et déploiement Railway

Pour le développement local, le service Postgres est défini dans `docker-compose.yml`. Sur Railway, créer un service PostgreSQL et configurer `DATABASE_URL` sur le service API à partir de la variable de connexion fournie par Railway. Définir aussi `APP_PASSWORD`, `COOKIE_SECRET`, `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` et `NODE_ENV=production`.

Avant le démarrage du service, lancer `pnpm db:migrate`. Les commandes de build et de démarrage de l'API sont `pnpm build` et `pnpm --filter @choral-writer/api start`. Le cookie est alors marqué `Secure`; l'application doit être servie en HTTPS.

## Commandes

- `pnpm dev` : API et front en mode développement
- `pnpm build` : build des packages et de l'application web
- `pnpm typecheck` : vérification TypeScript stricte
- `pnpm test` : tests Vitest de l'API et du front
- `pnpm db:generate` : générer une migration Drizzle depuis le schéma
- `pnpm db:migrate` : appliquer les migrations PostgreSQL

## Organisation du front

- `App.tsx` compose les routes React Router ; `pages/` contient les écrans et `components/` le layout et la navigation responsive.
- `auth/` gère la session et protège les routes. Un 401 redirige vers `/login`, puis la connexion ramène à la page demandée. Une erreur serveur reste affichée avec une possibilité de réessayer.
- `api/` centralise Axios et les appels REST ; l'intercepteur invalide la session sur un 401, sauf lors d'une tentative de connexion.
- `theme/` contient le thème Mantine. Les routes ont leurs propres URL : `/`, `/projects`, `/agents`, `/memories`, `/traces`.

En production, le serveur hébergeant le front doit servir `index.html` pour les routes de l'application, et acheminer `/api` vers Fastify.
