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
| `pnpm db:seed:demo` | Remplace les projets de démo dans la base de `.env` (voir ci-dessous) |

Commandes frontend ciblées :

| Commande | Utilité |
| --- | --- |
| `pnpm --filter @choral-writer/web dev` | Lance Vite seul (l'API doit être démarrée séparément) |
| `pnpm --filter @choral-writer/web build` | Typecheck frontend puis build Vite |
| `pnpm --filter @choral-writer/web typecheck` | Vérifie TypeScript du frontend |
| `pnpm --filter @choral-writer/web test` | Exécute les tests Vitest du frontend |

Le frontend utilise React 19, TypeScript, Vite, React Router 7, Mantine 8 et Tabler Icons. Les versions effectivement résolues sont enregistrées dans `pnpm-lock.yaml`.

## Données de démo

`pnpm db:seed:demo` écrit directement dans la base pointée par `.env`, sans appel LLM,
deux projets fictifs préfixés « Démo · » :

- **La cloche de Port-Lénic** : une équipe complète tirée de la bibliothèque d'agents (trois
  agents d'analyse, le Directeur mesuré, le Narrateur scénique et le Gardien des Intentions),
  la mémoire activée avec les tags de départ et des Intentions, et des tours tracés (coûts,
  tokens, durées, analyses, direction, développements dans la scène et hors champ, configuration).
  On y trouve un tour antérieur sans configuration enregistrée ni coût, une analyse relancée après
  une réponse invalide, le passage du Directeur de la version 1 à la version 2, un tour dont la
  direction échoue, un dernier tour en échec sur la branche principale et une branche
  « Alternative 1 » régénérée sans Directeur.
- **Expédition au col des Brumes** : un petit projet sans Directeur.

La commande est idempotente : elle remplace ces projets, repérés par leurs identifiants fixes
(`019aee20-…`), sans toucher aux autres. Elle ajoute au besoin les agents de la bibliothèque, comme
le serveur au démarrage. `pnpm db:seed:demo --clear` supprime seulement les projets de démo.
La commande refuse de s'exécuter avec `NODE_ENV=production`, et sur une base dont l'hôte n'est pas
`localhost`, `127.0.0.1` ou `::1`, sauf avec `--allow-remote`.

Le contenu est décrit dans `apps/api/src/demo/demoScenario.ts` ; `demoRows.ts` le traduit en lignes
conformes aux schémas réels, en validant les sorties comme le pipeline. Une nouvelle donnée de trace
s'ajoute à ces deux fichiers. `demoRows.test.ts` valide le scénario sans base, et
`demoSeed.integration.test.ts` vérifie que l'API relit tout sans erreur.

## Variables d'environnement

Les variables d'exemple dans `.env.example` sont destinées au développement et ne sont pas des secrets à déployer :

- `PORT` configure le port de l'API ciblé par le proxy Vite.
- `DATABASE_URL`, `APP_PASSWORD`, `COOKIE_SECRET`, `LLM_API_KEY`, `LLM_BASE_URL` et `LLM_MODEL` sont utilisées par l'API.
- `NODE_ENV` configure l'environnement de l'API.
- Le navigateur appelle l'API par le chemin relatif `/api`; aucune variable `VITE_*` n'est requise par le frontend actuellement.

Ne jamais committer de secrets. L'API et le frontend conservent leurs scripts et dépendances dans leurs manifestes respectifs.

## Déploiement Railway

Déployer le dépôt comme un service Railway unique. Définir les commandes du service dans les paramètres Railway : build `pnpm build`, pré-déploiement `pnpm db:migrate`, démarrage `pnpm start`, health check `/healthz` (timeout conseillé : 300 s). Le build compile `shared`, l'API et le frontend ; le serveur Fastify sert ensuite `apps/web/dist` et les routes `/api` depuis la même origine. Le serveur requiert le build frontend en mode `production` et échoue au démarrage s'il manque.

Créer une base PostgreSQL Railway et définir les variables suivantes dans le service applicatif :

- `DATABASE_URL` : référence à `DATABASE_URL` du service PostgreSQL Railway.
- `APP_PASSWORD` et `COOKIE_SECRET` : secrets uniques de production ; le secret de cookie doit avoir au moins 32 caractères.
- `LLM_API_KEY`, `LLM_BASE_URL` et `LLM_MODEL` : identifiants et cible du fournisseur LLM.
- `NODE_ENV=production` ; Railway fournit `PORT` au processus.

La commande `pnpm db:migrate` s'exécute en pré-déploiement. Les migrations peuvent nécessiter un instant de connexion à la base ; ne déployez pas si elles échouent. PostgreSQL est le seul stockage persistant ; le système de fichiers du conteneur ne doit pas contenir de données utilisateur. Les sauvegardes et la disponibilité de PostgreSQL, ainsi que l'accès réseau sortant vers le fournisseur LLM, restent à configurer/vérifier dans le projet Railway.

## Application installable (PWA)

Le frontend est installable sur Android depuis Chrome et Firefox. Aucun service worker n'est enregistré : l'installation ne l'exige pas et l'application n'a pas de stratégie hors ligne.

## Instructions pour les agents

Lire [`apps/web/AGENTS.md`](../apps/web/AGENTS.md) pour les consignes frontend et [`FRONTEND_CONVENTIONS.md`](./web/FRONTEND_CONVENTIONS.md) pour l'organisation des changements UI.

## Domaines et responsabilités

Le domaine conversationnel utilise le préfixe SQL `chat_` et les dossiers
`modules/chat`, `db/entities/chat` et `packages/shared/src/chat`.
Voir [CHAT.md](./api/CHAT.md) pour ses décisions et invariants.

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

Les tests d'intégration lisent `DATABASE_URL` depuis `.env.tests` à la racine du
dépôt, puis `pnpm test`. Vitest charge ce fichier automatiquement et ne transmet
cette URL qu'aux tests PostgreSQL. Il doit pointer vers une base jetable : les
tests appliquent les migrations et créent leurs propres projets ; ne jamais
utiliser une base de production. Les appels LLM sont simulés. Sans cette variable,
Vitest signale ces tests comme ignorés.
