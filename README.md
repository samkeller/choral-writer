# Choral Writer

Application de récit à la troisième personne : interprétation, agents d'analyse isolés, narration en streaming puis propositions de mémoire validées par le code. PostgreSQL conserve les appels, propositions, événements et projections ; les branches sont accessibles après un retour en arrière.

## Installation

Prérequis : Node.js 22+, pnpm 10 et PostgreSQL. Copier `.env.example` vers `.env`, puis renseigner `DATABASE_URL`, un mot de passe de 12 caractères minimum, un secret de cookie aléatoire de 32 caractères minimum, `LLM_API_KEY`, `LLM_BASE_URL` et `LLM_MODEL`. L'API du modèle doit être compatible OpenAI, y compris le streaming SSE.

```sh
pnpm install
pnpm build
pnpm db:migrate
pnpm dev
```

Le front de développement est disponible sur `http://localhost:5173` et transmet `/api` au serveur sur le port 3000. Ne pas exposer Vite à Internet.

## Utilisation

Créer une histoire avec son monde en Markdown. Si le document n'est pas vide, ouvrir **Mémoire**, demander les propositions initiales, les relire et les valider avant le premier tour. Les propositions rejetées restent modifiables ; celles déjà acceptées ont été enregistrées. Les sections `Pitch` et `Style` constituent les instructions du projet. Les instructions globales initiales proviennent de `config/global.md`, puis sont conservées en base et modifiables via `GET`/`PUT /api/settings/instructions` (`{"instructions":"..."}`).

Le projet utilise par défaut un interpréteur, un narrateur et un gardien. Un YAML personnalisé peut définir ces trois agents et des agents d'analyse ; les sorties doivent avoir `params.purpose: narrator` ou `guardian` et `context.whiteboard: true`. Les agents existants sont éditables dans l'onglet **Agents**. L'onglet **Mémoire** permet également d'envoyer des propositions JSON au réducteur ; pour justifier une correction d'un fait HIGH, fournir au niveau racine un `turnId` de la branche courante et un `resolution_event` dans la proposition.

Un budget optionnel se configure à la création ou dans **Agents → Budget du projet** avec, par exemple :

```json
{
  "budget": {
    "project_usd": 10,
    "turn_usd": 0.5,
    "prices": { "deepseek/deepseek-chat": { "input_per_million": 0.3, "output_per_million": 1.2 } }
  }
}
```

Les prix sont en dollars par million de tokens. Renseigner un plafond tarifaire à jour pour chaque modèle, y compris les frais éventuels : avant chaque tentative, le système réserve le coût maximal estimé d'après les octets d'entrée et `max_tokens`, en tenant compte des appels parallèles. La trace conserve le coût réel renvoyé par le fournisseur, ou l'estimation si le coût est absent. Une interruption avant la trace laisse la réservation comptabilisée pour éviter de sous-estimer les dépenses. Dans **Agents → Réservations de budget**, il est possible de rapprocher cette réservation avec le coût vérifié auprès du fournisseur ; l'estimation d'origine reste conservée. Ne pas renseigner zéro sans avoir vérifié que l'appel n'a pas été facturé. Si les tarifs réels dépassent les plafonds configurés, un dépassement reste possible ; les appels suivants seront bloqués. Un budget de projet ne peut pas être appliqué si des appels antérieurs ont un coût inconnu.

Le récit arrive progressivement. Un échec du gardien conserve la prose et bloque le prochain tour jusqu'à sa relance. Après interruption du serveur, le bouton « Reprendre le tour interrompu » réutilise l'interprétation, les analyses et la narration déjà persistées, et continue le pipeline. Un verrou PostgreSQL interdit une reprise concurrente. Le debug expose les interprétations, analyses, appels, coûts fournis par le prestataire et propositions. Le retour à un tour crée une branche ; le sélecteur permet de retrouver les autres branches. Les résumés sont produits tous les cinq tours, puis regroupés par cinq.

Les agents d'analyse ne reçoivent pas les faits privés inconnus de leur vue. Leurs événements et résumés sont reconstruits à partir des mutations visibles, plutôt qu'à partir des résumés omniscients ; la prose récente est limitée aux extraits littéraux correspondant à des faits ou croyances autorisés. Un événement qui n'a produit aucune mutation visible ne peut donc pas figurer dans cette vue. Les limites `max_input_tokens` sont appliquées de façon conservative en octets UTF-8 ; si le contexte critique du narrateur dépasse la limite, le tour échoue au lieu d'omettre des faits.

## Production

Le `Dockerfile` construit les trois paquets, applique les migrations au démarrage et sert l'interface et l'API sur la même origine. Sur Railway, utiliser PostgreSQL, configurer les variables de `.env.example` dans le service, une origine HTTPS et `NODE_ENV=production` (cookie sécurisé). Les messages et réponses complets sont enregistrés : protéger les accès à la base et aux journaux.

## Vérification

Les contrôles locaux et l'usage de la base de test sont détaillés dans [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md).

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

Pour le test d'intégration PostgreSQL, utiliser une base **réservée aux tests** : la migration y sera appliquée.

L'évaluation manuelle avec un vrai fournisseur est décrite dans [docs/LLM-EVALUATION.md](./docs/LLM-EVALUATION.md). Elle entraîne des coûts et complète les tests automatisés sans les remplacer.

## Limites actuelles

Une reprise nécessite une action explicite et peut répéter un appel interrompu avant que son résultat soit persisté. La mémoire utilise un journal d'événements et une projection JSONB par branche; les tables mémoire normalisées décrites dans les notes de conception ne sont pas implémentées. Les règles du réducteur limitent les contradictions mais ne peuvent pas garantir à elles seules la cohérence de la prose ; l'évaluation manuelle de 30 tours reste à effectuer.
