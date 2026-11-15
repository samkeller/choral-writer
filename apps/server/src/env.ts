import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';

export function loadEnv() {
  const result = config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });
  if (result.error && (!('code' in result.error) || result.error.code !== 'ENOENT')) {
    throw result.error;
  }
}
