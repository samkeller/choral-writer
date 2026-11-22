# Design system

Le frontend utilise Mantine 8 comme système UI de référence. Le thème est centralisé dans [`apps/web/src/theme/theme.ts`](../../apps/web/src/theme/theme.ts) et appliqué par `MantineProvider` dans `main.tsx`.

## Direction et principes UX

- Thème sombre uniquement, imposé par `forceColorScheme="dark"`, avec un fond charbon neutre plutôt qu'un noir absolu. Ne pas prévoir de variantes claires.
- Navigation de workspace compacte, panneaux discrets et bordures à faible contraste.
- La narration reste le contenu principal : largeur de lecture contenue, texte aéré et empatté pour les réponses de l'assistant.
- Réserver les couleurs vives à l'action principale, à la navigation active, aux états sémantiques et aux repères de phase.
- Préférer les composants et props Mantine aux styles personnalisés. Ne pas transformer les pages en tableaux de bord ni ajouter des cartes sans besoin.
- Conserver les états de chargement, erreur et vide explicites, les libellés accessibles, le focus clavier natif et la prise en charge de `prefers-reduced-motion` de Mantine.
- Privilégier la structure, les icônes et les libellés courts. Éviter les slogans, sous-titres décoratifs et explications répétées ; garder uniquement les indications nécessaires à une décision ou à une règle métier.

## Couleurs et surfaces

- `choral` est la palette d'accent et la couleur primaire, avec une nuance adaptée au mode sombre.
- `dark` est la palette neutre : le fond de page utilise la surface `dark.7`; les surfaces et bordures s'appuient sur les nuances voisines.
- Garder les couleurs sémantiques (`green`, `yellow`, `red`, `blue`) indépendantes de `choral` pour succès, avertissement, erreur et information.
- Utiliser les props `color`/`c` et les variables CSS Mantine (`--mantine-color-*`) plutôt que recopier des hexadécimaux. La couleur `theme-color` statique de `index.html` doit suivre la surface de fond.

### Grammaire des phases et contraste

- **Analyse** : bleu (`blue`), icône loupe (`IconSearch`). **Direction** : orange (`orange`), icône boussole (`IconCompass`). **Restitution** : violet (`violet`), icône plume (`IconFeather`). Le vert `choral` reste l'accent des actions et de la navigation, pas une couleur de phase.
- La définition typée est centralisée dans [`phasePresentation.ts`](../../apps/web/src/components/phases/phasePresentation.ts).
- Séparer la phase du contrat de sortie : celui-ci reste un texte secondaire neutre, comme le numéro de version et le nombre de projets. Ne pas employer les couleurs de phase pour signaler succès ou erreur.
- Sur une surface interactive métier, un liseré de phase peut faciliter le balayage ; la bordure complète indique le détail ouvert. Ne pas colorer toute la surface ni ajouter d'ombre importante.
- Le thème renforce les textes secondaires et placeholders (`dark.2`/`dark.3`), ainsi que les textes des variantes Mantine `light`, `subtle` et `outline` (nuance 2). La variante `light` signifie ici un fond teinté, pas un thème clair. `autoContrast` choisit le texte des boutons pleins, notamment sur le vert d'action. Vérifier le contraste sur la surface réelle, pas seulement la palette.

### Actions compactes

Utiliser [`IconAction`](../../apps/web/src/components/atoms/IconAction.tsx) pour les actions secondaires : icône Tabler, tooltip au survol et au focus clavier, même libellé accessible via `label`. Le composant accepte les liens React Router et transmet les références pour les popovers. Le tooltip complète le nom accessible, il ne le remplace pas ; sa largeur est bornée et les noms longs reviennent à la ligne.

Garder des boutons textuels pour les actions principales, les formulaires, les confirmations destructives et les reprises après erreur. Les icônes secondaires restent neutres ; le rouge identifie les suppressions.

## Typographie

Le thème définit une pile sans dépendance de police distante, avec une hiérarchie compacte pour les titres. Une pile système reste le repli si Inter n'est pas installé localement. Les réponses narratives emploient une pile serif locale avec une hauteur de ligne généreuse ; l'interface et les contrôles restent sans serif.

## Espacements, rayons et responsive

Les échelles `spacing`, `radius`, `shadows` et `breakpoints` Mantine sont configurées dans le thème. Utiliser leurs clés (`xs` à `xl`) dans les props Mantine ; éviter les valeurs numériques arbitraires. Les breakpoints sont exprimés en `em`; préférer les props responsives Mantine et `visibleFrom`/`hiddenFrom`. Le layout conserve une navigation latérale sur grand écran et une barre basse avec zone de sécurité sur mobile.

Sur mobile, cette barre basse réunit les liens de navigation et la déconnexion :
pas de bannière de marque supplémentaire en haut. Dans le chat, la saisie
commence sur une ligne, avec envoi et régénération sur la même rangée pour
privilégier la lecture. Le libellé de branche reste accessible sans prendre une
ligne visuelle supplémentaire.

## Utilisation et personnalisation

- `createTheme` centralise les palettes, la typographie, les échelles et les valeurs par défaut de composants.
- `forceColorScheme="dark"` ignore les préférences système et une éventuelle ancienne préférence stockée.
- Utiliser d'abord les composants Mantine et leurs props. N'ajouter un `classNames` ou un CSS Module que pour un besoin visuel non couvert par l'API.
- Garder `styles.css` limité aux bases du document. Pour une exception locale, créer un CSS Module près du composant et utiliser les variables CSS Mantine.
- Ne pas cibler les classes internes Mantine, ajouter un framework de styles, ni créer un jeu de tokens parallèle.
