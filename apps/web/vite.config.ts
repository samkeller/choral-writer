import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const envDir = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig(({ mode }) => {
  const apiPort = loadEnv(mode, envDir).PORT ?? '3001';
  return {
    envDir,
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/api': `http://localhost:${apiPort}`,
        '/healthz': `http://localhost:${apiPort}`,
      },
    },
  };
});
