import { config } from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadEnv } from './env.js';

vi.mock('dotenv', () => ({ config: vi.fn() }));

describe('loadEnv', () => {
  beforeEach(() => {
    vi.mocked(config).mockReset();
  });

  it('loads the root .env using a native filesystem path', () => {
    vi.mocked(config).mockReturnValue({});
    loadEnv();
    expect(config).toHaveBeenCalledWith({
      path: resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../.env')
    });
  });

  it('permits a missing .env when variables are provided externally', () => {
    vi.mocked(config).mockReturnValue({ error: Object.assign(new Error('missing'), { code: 'ENOENT' }) });
    expect(loadEnv).not.toThrow();
  });

  it('reports other errors reading .env', () => {
    const error = Object.assign(new Error('unreadable'), { code: 'EACCES' });
    vi.mocked(config).mockReturnValue({ error });
    expect(loadEnv).toThrow(error);
  });
});
