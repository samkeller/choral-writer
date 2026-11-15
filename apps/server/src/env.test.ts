import { config } from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadEnv, parseAppEnv, parseDatabaseEnv } from './env.js';

vi.mock('dotenv', () => ({ config: vi.fn() }));

describe('loadEnv', () => {
  beforeEach(() => {
    vi.mocked(config).mockReset();
  });

  it('loads the root .env using a native filesystem path', () => {
    vi.mocked(config).mockReturnValue({});
    loadEnv();
    expect(config).toHaveBeenCalledWith({
      path: resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../.env'),
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

  it('validates runtime settings and applies documented defaults', () => {
    expect(
      parseAppEnv({
        DATABASE_URL: 'postgres://localhost/choral',
        APP_PASSWORD: 'a-long-enough-password',
        COOKIE_SECRET: 'a-cookie-secret-that-is-at-least-32-characters',
        LLM_API_KEY: 'test-key',
        LLM_MODEL: 'test-model',
      }),
    ).toMatchObject({
      LLM_BASE_URL: 'https://openrouter.ai/api/v1',
      PORT: 3000,
      NODE_ENV: 'development',
    });
  });

  it('allows migrations to require only a database URL', () => {
    expect(parseDatabaseEnv({ DATABASE_URL: 'postgres://localhost/choral' })).toEqual({
      DATABASE_URL: 'postgres://localhost/choral',
    });
    expect(() => parseDatabaseEnv({})).toThrow();
  });
});
