/**
 * Seuils responsive de l'application, exprimés en `em` comme l'attend Mantine.
 *
 * Source unique : `theme.ts` les expose aux props responsives Mantine
 * (`visibleFrom`, `direction={{ base, md }}`…) et `vite.config.ts` les injecte
 * dans le CSS via `postcss-simple-vars`, ce qui autorise
 * `@media (max-width: $mantine-breakpoint-md)` dans les CSS Modules.
 * Toute modification ici se propage aux deux ; ne pas recopier ces valeurs ailleurs.
 */
export const breakpoints = {
  xs: '36em',
  sm: '48em',
  md: '62em',
  lg: '75em',
  xl: '88em',
} as const;

/**
 * Suffixe d'une valeur `em` décalée sous le seuil, pour une requête
 * `max-width` strictement en dessous du breakpoint. `postcss-simple-vars`
 * ne sait pas calculer, la table est donc explicite.
 */
export const breakpointsBelow = {
  xs: '35.99em',
  sm: '47.99em',
  md: '61.99em',
  lg: '74.99em',
  xl: '87.99em',
} as const satisfies Record<keyof typeof breakpoints, string>;

/** Variables consommées par le CSS ; les noms suivent la convention Mantine. */
export const breakpointCssVariables: Record<string, string> = Object.fromEntries([
  ...Object.entries(breakpoints).map(([name, value]) => [`mantine-breakpoint-${name}`, value]),
  ...Object.entries(breakpointsBelow).map(([name, value]) => [`mantine-breakpoint-${name}-below`, value]),
]);
