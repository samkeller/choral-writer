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
{"budget":{"project_usd":10,"turn_usd":0.5,"prices":{"deepseek/deepseek-chat":{"input_per_million":0.3,"output_per_million":1.2}}}}
```

Les prix sont en dollars par million de tokens. Renseigner un plafond tarifaire à jour pour chaque modèle, y compris les frais éventuels : avant chaque tentative, le système réserve le coût maximal estimé d'après les octets d'entrée et `max_tokens`, en tenant compte des appels parallèles. La trace conserve le coût réel renvoyé par le fournisseur, ou l'estimation si le coût est absent. Une interruption avant la trace laisse la réservation comptabilisée pour éviter de sous-estimer les dépenses. Dans **Agents → Réservations de budget**, il est possible de rapprocher cette réservation avec le coût vérifié auprès du fournisseur ; l'estimation d'origine reste conservée. Ne pas renseigner zéro sans avoir vérifié que l'appel n'a pas été facturé. Si les tarifs réels dépassent les plafonds configurés, un dépassement reste possible ; les appels suivants seront bloqués. Un budget de projet ne peut pas être appliqué si des appels antérieurs ont un coût inconnu.

Le récit arrive progressivement. Un échec du gardien conserve la prose et bloque le prochain tour jusqu'à sa relance. Après interruption du serveur, le bouton « Reprendre le tour interrompu » réutilise l'interprétation, les analyses et la narration déjà persistées, et continue le pipeline. Un verrou PostgreSQL interdit une reprise concurrente. Le debug expose les interprétations, analyses, appels, coûts fournis par le prestataire et propositions. Le retour à un tour crée une branche ; le sélecteur permet de retrouver les autres branches. Les résumés sont produits tous les cinq tours, puis regroupés par cinq.

Les agents d'analyse ne reçoivent pas les faits privés inconnus de leur vue. Leurs événements et résumés sont reconstruits à partir des mutations visibles, plutôt qu'à partir des résumés omniscients ; la prose récente est limitée aux extraits littéraux correspondant à des faits ou croyances autorisés. Un événement qui n'a produit aucune mutation visible ne peut donc pas figurer dans cette vue. Les limites `max_input_tokens` sont appliquées de façon conservative en octets UTF-8 ; si le contexte critique du narrateur dépasse la limite, le tour échoue au lieu d'omettre des faits.

## Production

Le `Dockerfile` construit les trois paquets, applique les migrations au démarrage et sert l'interface et l'API sur la même origine. Sur Railway, utiliser PostgreSQL, configurer les variables de `.env.example` dans le service, une origine HTTPS et `NODE_ENV=production` (cookie sécurisé). Les messages et réponses complets sont enregistrés : protéger les accès à la base et aux journaux.

## Vérification

`pnpm test` exécute les tests unitaires. Pour le test d'intégration PostgreSQL, utiliser une base **réservée aux tests** : la migration y sera appliquée.

```sh
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/choral_test pnpm test
```

### Contrôle manuel de cohérence sur 30 tours

Avec un fournisseur LLM configuré, créer une histoire de test contenant Pierre, Marie, Léon, Hugo et un baron. Dans le monde initial, Pierre a perdu sa main gauche ; la porte de la crypte est verrouillée et personne ne possède sa clé ; Léon a tué le baron et il est seul à le savoir ; Marie croit à tort que Hugo l'a tué. Marie refuse d'accuser publiquement quelqu'un sans preuve. Vérifier les propositions initiales avant de les appliquer : la mort causée par Léon doit être un fait privé HIGH connu de Léon, et la croyance de Marie une connaissance fausse liée à ce fait. Corriger la mémoire si nécessaire.

Ajouter un agent d'analyse pour Marie, avec un modèle disponible et la configuration suivante. Il décide de ses réactions, tandis que Pierre est piloté par l'utilisateur.

```json
{
  "key": "marie", "name": "Marie", "kind": "analysis",
  "model": "REMPLACER_PAR_LE_MODELE_CONFIGURE",
  "system_prompt": "Tu incarnes Marie. Ne connais que les informations de ta vue. Tu refuses d'accuser publiquement quelqu'un sans preuve, même sous pression. Décide librement de tes réactions et exprime ton refus comme une contrainte si nécessaire.",
  "params": {"temperature": 0.7, "max_tokens": 800, "timeout_ms": 60000},
  "context": {"entities": ["marie"], "knowledge_of": ["marie"], "events": {"last": 6}, "summaries": [1]},
  "schedule": {"mode": "always"}, "required": true, "enabled": true
}
```

Jouer 30 tours en cinq séries de six : installer la scène et rappeler les faits ; demander à Pierre d'utiliser ses deux mains ou de franchir la porte sans moyen établi ; lui faire interroger Marie puis faire pression pour qu'elle accuse Hugo ; introduire des ellipses et scènes sans Marie ; revenir sur la porte, la main et le secret. Varier les formulations et examiner la prose et le debug après chaque tour. Vérifier que les intentions de Pierre ne deviennent pas automatiquement des résultats, que le refus de Marie est transmis et respecté, que sa croyance ne devient pas un fait, et que ni Pierre ni Marie n'apprennent le secret sans événement justificatif. Contrôler aussi les propositions et les résumés après les tours 5, 10, 15, 20, 25 et 30.

Noter toute contradiction avec son numéro de tour, la prose, la résolution, les contributions et les propositions du debug. Une résolution ou correction explicitement justifiée peut faire évoluer l'état ; seule une contradiction sans justification est un échec. Ce contrôle évalue le modèle et les prompts choisis et ne remplace pas les tests automatisés.

## Limites actuelles

Une reprise nécessite une action explicite et peut répéter un appel interrompu avant que son résultat soit persisté. Les projections sont stockées sous forme d'un document JSON par branche plutôt que dans les tables relationnelles détaillées du dossier. Les règles du réducteur limitent les contradictions mais ne peuvent pas garantir à elles seules la cohérence de la prose ; le test manuel de 30 tours reste à effectuer.
