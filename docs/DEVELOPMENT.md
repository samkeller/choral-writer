# Développement

## Prérequis et démarrage

- Node.js LTS, pnpm 12 et Docker Desktop pour la base de données locale.
- À la racine : copier `.env.example` vers `.env`, renseigner les valeurs locales, puis lancer `pnpm install`.
- Démarrer PostgreSQL avec `docker compose up -d` si nécessaire et appliquer les migrations avec `pnpm db:migrate`.
- `pnpm dev` démarre l'API et Vite. Le frontend est servi sur le port `5175`; Vite relaie `/api` et `/healthz` vers `http://127.0.0.1:<PORT>`, où `PORT` vaut `3001` par défaut.

Après une mise à jour ou un changement de branche qui ajoute des migrations,
réexécuter `pnpm db:migrate` avant `pnpm dev`. Le serveur ne migre pas la base
automatiquement ; une ancienne structure peut rendre les endpoints incompatibles.

## Worktree isolé pour tester une branche

Pour tester plusieurs branches en parallèle, sans arrêter les autres serveurs ni partager de base, lancer depuis n'importe quel checkout du dépôt :

```sh
pnpm wt:new <nom> [--branch <branche>] [--base <branche>] [--empty] [--first-port <port>] [--pg-bin <dossier>] [--parent-dir <dossier>]
pnpm wt:remove <nom> [--branch <branche>] [--base <branche>] [--force] [--parent-dir <dossier>]
```

`<nom>` : minuscules, chiffres et tirets. `wt:new` prépare un worktree prêt pour `pnpm dev` :

1. crée la branche `--branch` (défaut `feat/<nom>`) depuis `origin/<base>` (défaut `feat/v2`) dans `<dossier parent>/<nom>`. Le dossier parent vaut `--parent-dir`, sinon `CHORAL_WT_DIR`, sinon `../choral-wt` ; un chemin relatif part du checkout principal ;
2. copie `.env` et `.env.tests` du checkout principal ; dans `.env`, `DATABASE_URL` vise la base `choral_writer_wt_<nom>` (tirets changés en `_`) et `PORT` prend le premier port libre à partir de `--first-port` (défaut `3002`) qu'aucun autre checkout ne réserve. `.env.tests` est recopié tel quel : tous les checkouts partagent volontairement la même base de test jetable. Vite suit ce `PORT` et prend le port libre suivant si `5175` est occupé ;
3. crée la base, puis y copie le schéma `choral_writer` (structure et données) de la base du checkout principal par `pg_dump --no-owner --no-privileges | psql`, car le rôle applicatif ne peut pas la prendre pour modèle. Avec `--empty`, la base reste vide et seules les migrations la remplissent ;
4. lance `pnpm install --frozen-lockfile` avec le store pnpm du checkout principal, `pnpm db:migrate` puis le build de `shared`.

`pg_dump` et `psql` sont cherchés dans `--pg-bin` ou `PG_BIN`, puis dans le PATH, puis, sous Windows, dans la version la plus récente de `C:\Program Files\PostgreSQL\<version>\bin`. `--empty` s'en passe. Les mots de passe passent par l'environnement des binaires et ne sont jamais affichés. Si la préparation échoue, le message donne la commande de nettoyage.

`wt:remove`, lancé depuis un autre checkout, ne touche qu'à un worktree secondaire enregistré par `git worktree list` et situé dans le dossier parent : il refuse toujours le checkout principal, un dossier qui le contient et tout autre dossier. Il supprime alors, dans cet ordre, le dossier, l'enregistrement du worktree, sa branche locale puis la base `choral_writer_wt_<nom>`. Il refuse si la branche n'est pas fusionnée dans `origin/<base>` ou si le worktree contient des modifications non commitées ; `--force` passe outre.

Pour une branche existante, comme celle d'une PR, partir de son sommet : `pnpm wt:new <nom> --base <branche de la PR>`, puis `pnpm wt:remove <nom> --base <branche de la PR>`, qui vérifie qu'aucun commit local ne serait perdu.

Reprise après un échec partiel : relancer la même commande. Un fichier verrouillé sous Windows, par exemple par un serveur encore lancé, interrompt la suppression du dossier : arrêter le serveur puis relancer, avec `--force` si git ne peut plus lire le dossier à moitié supprimé. Si plus aucun worktree n'est enregistré sous ce nom, `wt:remove` ne supprime rien sans `--force`. Avec `--force`, il supprime la base `choral_writer_wt_<nom>` et la branche `--branch` (défaut `feat/<nom>`) si elle existe et n'est extraite nulle part. Il vaut mieux vérifier avant que cette base et cette branche n'appartiennent à aucun autre worktree.

## Workspaces et scripts

Le repository pnpm contient `apps/web` (React/Vite), `apps/api` (Fastify) et `packages/shared` (contrats et validation partagés). Les scripts racine coordonnent les workspaces :

| Commande | Utilité |
| --- | --- |
| `pnpm dev` | Démarre l'API et le frontend en parallèle |
| `pnpm build` | Construit `shared`, l'API puis le frontend |
| `pnpm typecheck` | Vérifie les types des packages et applications |
| `pnpm test` | Exécute les tests de l'API et du frontend avec Vitest |
| `pnpm wt:new` / `pnpm wt:remove` | Crée ou supprime un [worktree isolé](#worktree-isolé-pour-tester-une-branche) |

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
