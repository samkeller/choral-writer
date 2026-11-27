import { describe, expect, it } from 'vitest';

import { localDatabaseRefusal } from './localDatabaseGuard.js';

describe('local database guard', () => {
  const local = 'postgres://user:secret@localhost:5432/demo';

  it('accepts a local development database', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      expect(localDatabaseRefusal({ databaseUrl: `postgres://u:p@${host}:5432/demo`, nodeEnv: 'development' },
        { allowRemote: false }, 'Demo data')).toBeNull();
    }
  });

  it('refuses production, even locally', () => {
    expect(localDatabaseRefusal({ databaseUrl: local, nodeEnv: 'production' }, { allowRemote: true }, 'Demo data'))
      .toMatch(/production/);
  });

  it('refuses a remote host unless explicitly allowed, naming what would be written', () => {
    const remote = { databaseUrl: 'postgres://u:p@db.example.com:5432/demo', nodeEnv: 'development' };
    expect(localDatabaseRefusal(remote, { allowRemote: false }, 'Evaluation projects'))
      .toMatch(/evaluation projects.*--allow-remote/);
    expect(localDatabaseRefusal(remote, { allowRemote: true }, 'Demo data')).toBeNull();
  });
});
