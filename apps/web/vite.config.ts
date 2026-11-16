import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const envDir = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig(({ mode }) => {
  /** Chaine vide -> Charge toutes les variables d'environnement */
  const env = loadEnv(mode, envDir, '');
  const apiPortValue = env.PORT?.trim() || '3001';
  const apiTarget = `http://127.0.0.1:${apiPortValue}`;

  return {
    envDir,
    plugins: [react(), tailwindcss()],
    server: {
      port: 5175,
      proxy: {
        '/api': apiTarget,
        '/healthz': apiTarget,
      },
    },
  };
});
