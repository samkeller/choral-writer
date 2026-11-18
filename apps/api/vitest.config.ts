import { fileURLToPath } from 'node:url';

import { config as loadDotEnv } from 'dotenv';
import { defineConfig } from 'vitest/config';

loadDotEnv({
  path: fileURLToPath(new URL('../../.env.tests', import.meta.url)),
  override: true,
});

export default defineConfig({
  test: { fileParallelism: false },
});
