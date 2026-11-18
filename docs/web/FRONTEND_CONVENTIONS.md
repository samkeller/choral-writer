# Conventions frontend

## Organisation

- `apps/web/src/api/` : client HTTP et appels backend ; les contrats partagés viennent de `packages/shared`.
- `auth/` : session, protection et redirection des routes.
- `components/` : composants réutilisables de workspace et composants métier (`chat/`, `projects/`).
- `hooks/` : logique applicative réutilisée liée aux données et aux états.
- `pages/` : écrans associés aux routes déclarées dans `App.tsx`.
- `theme/` : configuration Mantine centralisée.

Garder la logique métier et les appels API dans leurs modules existants ; ne pas déplacer ni réécrire ces responsabilités pour harmoniser l'interface.

## React, TypeScript et imports

- Utiliser des composants fonctionnels React et des props typées. Extraire un composant uniquement si la réutilisation ou la clarté le justifie.
- Respecter les imports relatifs terminés par `.js` du frontend et la configuration TypeScript stricte existante.
- Conserver React Router, les gardes d'authentification et les contrats API.
- Réutiliser `Brand`, `WorkspaceNavigation`, `PageHeader` et les composants métier existants avant d'en créer de nouveaux.

## UI et styles

- Consulter [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md) avant de construire une interface.
- Utiliser Mantine 8 en priorité : layout, formulaires, navigation, feedback, props responsives et thème.
- Ne pas ajouter Tailwind ni une seconde solution de styling. Le CSS global ne concerne que le document ; les exceptions locales sont des CSS Modules fondés sur les variables Mantine.
- Ne pas multiplier les variantes ou wrappers génériques. Garder les styles et composants métier près de leur domaine.
- Utiliser `components/atoms/IconAction` pour les actions secondaires : icône Tabler, tooltip au survol/focus et libellé accessible unique. Conserver les boutons textuels pour les actions principales et les confirmations.
- Le thème est sombre uniquement. Éviter les textes décoratifs ou les explications redondantes ; préserver les aides nécessaires aux règles métier et aux erreurs.

## États, erreurs et responsive

- Rendre les états de chargement, vide et erreur explicitement ; proposer une action de reprise lorsqu'elle est possible.
- Afficher les erreurs applicatives avec les helpers existants, notamment `getErrorMessage`. Ne pas masquer les échecs par un état de succès ou une valeur de repli.
- Garder la validation de formulaire liée aux schémas partagés. Préserver les comportements d'authentification et d'API.
- Tester les interactions principales, le clavier et les largeurs mobiles. Utiliser les props responsives Mantine avant d'écrire une media query ; respecter les zones de sécurité sur la barre basse.

## Nouveaux composants

Créer un composant partagé lorsque plusieurs vues ont un besoin concret commun ou qu'une unité métier devient difficile à lire. Le placer dans le dossier du domaine concerné, définir une API typée minimale, éviter les abstractions spéculatives et documenter une nouvelle convention seulement si elle impacte les prochains changements.
