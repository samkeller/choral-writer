# Évaluation manuelle avec un vrai fournisseur

Cette procédure évalue les prompts et modèles configurés sur une histoire contrôlée. Elle consomme des appels LLM; configurez des budgets prudents et inspectez les traces enregistrées.

## Préparer l'histoire

Avec un fournisseur disponible, créer une histoire qui contient Pierre, Marie, Léon, Hugo et un baron. Définir dans le monde initial :

- Pierre a perdu sa main gauche.
- La porte de la crypte est verrouillée et personne ne possède sa clé.
- Léon a tué le baron et il est seul à le savoir.
- Marie croit à tort que Hugo a tué le baron.
- Marie refuse d'accuser publiquement quelqu'un sans preuve.

Examiner les propositions initiales avant de les appliquer. Le meurtre doit être un fait privé HIGH connu de Léon; la croyance de Marie doit rester une connaissance fausse distincte du fait. Corriger la mémoire si nécessaire.

Ajouter l'agent d'analyse suivant avec un modèle configuré. Pierre reste piloté par l'utilisateur; l'agent détermine les réactions de Marie.

```json
{
  "key": "marie",
  "name": "Marie",
  "kind": "analysis",
  "model": "REMPLACER_PAR_LE_MODELE_CONFIGURE",
  "system_prompt": "Tu incarnes Marie. Ne connais que les informations de ta vue. Tu refuses d'accuser publiquement quelqu'un sans preuve, même sous pression. Décide librement de tes réactions et exprime ton refus comme une contrainte si nécessaire.",
  "params": { "temperature": 0.7, "max_tokens": 800, "timeout_ms": 60000 },
  "context": {
    "entities": ["marie"],
    "knowledge_of": ["marie"],
    "events": { "last": 6 },
    "summaries": [1]
  },
  "schedule": { "mode": "always" },
  "required": true,
  "enabled": true
}
```

## Exécution et vérifications

Jouer 30 tours en cinq séries de six :

1. Installer la scène et rappeler les faits.
2. Demander à Pierre d'utiliser ses deux mains ou de franchir la porte sans moyen établi.
3. Lui faire interroger Marie puis faire pression pour qu'elle accuse Hugo.
4. Introduire des ellipses et des scènes sans Marie.
5. Revenir sur la porte, la main et le secret.

Varier les formulations et examiner la prose et le debug après chaque tour. Vérifier que :

- les intentions de Pierre ne deviennent pas automatiquement des résultats;
- le refus de Marie est transmis et respecté;
- sa croyance ne devient pas un fait;
- ni Pierre ni Marie n'apprennent le secret sans événement justificatif.

Examiner aussi les propositions et résumés après les tours 5, 10, 15, 20, 25 et 30. Noter toute contradiction avec son numéro de tour, la prose, la résolution, les contributions et les propositions du debug. Une résolution ou correction explicitement justifiée peut faire évoluer l'état; seule une contradiction sans justification est un échec.

Ce contrôle évalue la combinaison modèle/prompts et ne remplace pas les tests déterministes et PostgreSQL.
