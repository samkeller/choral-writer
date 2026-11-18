import { createTheme, defaultVariantColorsResolver, parseThemeColor, type CSSVariablesResolver } from '@mantine/core';
import { breakpoints } from './breakpoints';
import { ThemeCode } from './mantine/ThemeCode';

export const cssVariablesResolver: CSSVariablesResolver = (theme) => ({
  variables: {},
  light: {},
  dark: {
    '--mantine-color-dimmed': theme.colors.dark[2],
    '--mantine-color-placeholder': theme.colors.dark[3],
  },
});

export const theme = createTheme({
  primaryColor: 'choral',
  primaryShade: 5,
  autoContrast: true,
  variantColorResolver: (input) => {
    const resolved = defaultVariantColorsResolver(input);
    const parsed = parseThemeColor({ color: input.color || input.theme.primaryColor, theme: input.theme });
    if (!parsed.isThemeColor || !['light', 'subtle', 'outline'].includes(input.variant)) return resolved;
    return {
      ...resolved,
      color: `var(--mantine-color-${parsed.color}-2)`,
    };
  },
  colors: {
    choral: [
      '#e7fff5',
      '#c8f7e4',
      '#a4edcf',
      '#80e3bb',
      '#5ddaa7',
      '#3ccf93',
      '#2ab57f',
      '#208e64',
      '#176a4b',
      '#0e4833',
    ],
    dark: [
      '#f4f4f5',
      '#e7e8eb',
      '#c8c9ce',
      '#a9abb2',
      '#85878f',
      '#62646d',
      '#3b3d45',
      '#292b32',
      '#202228',
      '#17181d',
    ],
  },
  white: '#f4f4f5',
  black: '#111216',
  defaultRadius: 'md',
  fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontFamilyMonospace: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  headings: {
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontWeight: '600',
    textWrap: 'balance',
    sizes: {
      h1: { fontSize: '2rem', lineHeight: '1.2' },
      h2: { fontSize: '1.5rem', lineHeight: '1.3' },
      h3: { fontSize: '1.2rem', lineHeight: '1.35' },
      h4: { fontSize: '1rem', lineHeight: '1.4' },
      h5: { fontSize: '0.875rem', lineHeight: '1.45' },
      h6: { fontSize: '0.75rem', lineHeight: '1.5' },
    },
  },
  spacing: {
    xs: '0.5rem',
    sm: '0.75rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
  },
  radius: {
    xs: '0.25rem',
    sm: '0.375rem',
    md: '0.5rem',
    lg: '0.75rem',
    xl: '1rem',
  },
  shadows: {
    xs: '0 1px 2px rgb(0 0 0 / 12%)',
    sm: '0 2px 6px rgb(0 0 0 / 16%)',
    md: '0 4px 12px rgb(0 0 0 / 18%)',
    lg: '0 8px 24px rgb(0 0 0 / 20%)',
    xl: '0 12px 32px rgb(0 0 0 / 22%)',
  },
  breakpoints,
  components: {
    Button: { defaultProps: { radius: 'md' } },
    ActionIcon: { defaultProps: { radius: 'md' } },
    TextInput: { defaultProps: { radius: 'md' } },
    PasswordInput: { defaultProps: { radius: 'md' } },
    Textarea: { defaultProps: { radius: 'md' } },
    Paper: { defaultProps: { radius: 'md' } },
    Modal: { defaultProps: { centered: true, closeButtonProps: { 'aria-label': 'Fermer' } } },
    Drawer: { defaultProps: { closeButtonProps: { 'aria-label': 'Fermer' } } },
    Code: ThemeCode
  },
});
