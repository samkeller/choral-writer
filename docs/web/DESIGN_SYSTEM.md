# Design system

Le frontend utilise Mantine 8 comme système UI de référence. Le thème est centralisé dans [`apps/web/src/theme/index.ts`](../apps/web/src/theme/index.ts) et appliqué par `MantineProvider` dans `main.tsx`.

## Direction et principes UX

- Dark par défaut, avec un fond charbon neutre plutôt qu'un noir absolu.
- Navigation de workspace compacte, panneaux discrets et bordures à faible contraste.
- La narration reste le contenu principal : largeur de lecture contenue, texte aéré et empatté pour les réponses de l'assistant.
- Réserver les couleurs vives à l'action principale, à la navigation active et aux états sémantiques.
- Préférer les composants et props Mantine aux styles personnalisés. Ne pas transformer les pages en tableaux de bord ni ajouter des cartes sans besoin.
- Conserver les états de chargement, erreur et vide explicites, les libellés accessibles, le focus clavier natif et la prise en charge de `prefers-reduced-motion` de Mantine.

## Couleurs et surfaces

- `choral` est la palette d'accent et la couleur primaire, avec une nuance adaptée au mode sombre.
- `dark` est la palette neutre : le fond de page utilise la surface `dark.7`; les surfaces et bordures s'appuient sur les nuances voisines.
- Garder les couleurs sémantiques (`green`, `yellow`, `red`, `blue`) indépendantes de `choral` pour succès, avertissement, erreur et information.
- Utiliser les props `color`/`c` et les variables CSS Mantine (`--mantine-color-*`) plutôt que recopier des hexadécimaux. La couleur `theme-color` statique de `index.html` doit suivre la surface de fond.

## Typographie

Le thème définit une pile sans dépendance de police distante, avec une hiérarchie compacte pour les titres. Une pile système reste le repli si Inter n'est pas installé localement. Les réponses narratives emploient une pile serif locale avec une hauteur de ligne généreuse ; l'interface et les contrôles restent sans serif.

## Espacements, rayons et responsive

Les échelles `spacing`, `radius`, `shadows` et `breakpoints` Mantine sont configurées dans le thème. Utiliser leurs clés (`xs` à `xl`) dans les props Mantine ; éviter les valeurs numériques arbitraires. Les breakpoints sont exprimés en `em`; préférer les props responsives Mantine et `visibleFrom`/`hiddenFrom`. Le layout conserve une navigation latérale sur grand écran et une barre basse avec zone de sécurité sur mobile.

## Utilisation et personnalisation

- `createTheme` centralise les palettes, la typographie, les échelles et les valeurs par défaut de composants.
- `defaultColorScheme="dark"` établit le schéma par défaut sans imposer le mode sombre à une future préférence utilisateur.
- Utiliser d'abord les composants Mantine et leurs props. N'ajouter un `classNames` ou un CSS Module que pour un besoin visuel non couvert par l'API.
- Garder `styles.css` limité aux bases du document. Pour une exception locale, créer un CSS Module près du composant et utiliser les variables CSS Mantine.
- Ne pas cibler les classes internes Mantine, ajouter un framework de styles, ni créer un jeu de tokens parallèle.
