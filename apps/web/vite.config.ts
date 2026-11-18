import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import simpleVars from 'postcss-simple-vars';
import { defineConfig, loadEnv } from 'vite';

import { breakpointCssVariables } from './src/theme/breakpoints.js';

const envDir = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig(({ mode }) => {
  /** Chaine vide -> Charge toutes les variables d'environnement */
  const env = loadEnv(mode, envDir, '');
  const apiPortValue = env.PORT?.trim() || '3001';
  const apiTarget = `http://127.0.0.1:${apiPortValue}`;

  return {
    envDir,
    css: {
      // Une variable CSS ne peut pas servir dans une requête média : les seuils du
      // thème sont exposés à PostCSS pour `@media (max-width: $mantine-breakpoint-md)`.
      postcss: { plugins: [simpleVars({ variables: breakpointCssVariables })] },
    },
    plugins: [react()],
    server: {
      port: 5175,
      proxy: {
        '/api': apiTarget,
        '/healthz': apiTarget,
      },
    },
  };
});
