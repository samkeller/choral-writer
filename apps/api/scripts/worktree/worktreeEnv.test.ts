import { describe, expect, it } from 'vitest';

import {
  deriveWorktreeEnv,
  nextUnreservedPort,
  readEnvValue,
  withDatabaseName,
  worktreeDatabaseName,
} from './worktreeEnv.js';

describe('worktreeDatabaseName', () => {
  it('préfixe le nom et remplace les tirets', () => {
    expect(worktreeDatabaseName('essai-wt')).toBe('choral_writer_wt_essai_wt');
  });

  it.each(['', 'Essai', 'essai_wt', '-essai', 'essai--wt', 'a'.repeat(41), 'x; drop'])(
    'refuse le nom « %s »',
    (name) => {
      expect(() => worktreeDatabaseName(name)).toThrow(/Nom de worktree invalide/);
    },
  );
});

describe('withDatabaseName', () => {
  it('ne change que le nom de base et conserve les paramètres', () => {
    expect(
      withDatabaseName('postgres://user:p%40ss@localhost:5432/dev?sslmode=disable', 'cible'),
    ).toBe('postgres://user:p%40ss@localhost:5432/cible?sslmode=disable');
  });
});

describe('readEnvValue', () => {
  it('lit une valeur, avec ou sans guillemets, en ignorant les commentaires', () => {
    const content = '# PORT=1\nPORT=3005\r\nNAME="valeur"\n';
    expect(readEnvValue(content, 'PORT')).toBe('3005');
    expect(readEnvValue(content, 'NAME')).toBe('valeur');
    expect(readEnvValue(content, 'ABSENT')).toBeUndefined();
  });
});

describe('deriveWorktreeEnv', () => {
  const target = { databaseName: 'choral_writer_wt_essai', port: 3007 };

  it('remplace la base et le port sans toucher aux autres lignes', () => {
    const content = [
      'DATABASE_URL=postgres://u:secret@localhost:5432/dev',
      'APP_PASSWORD=secret',
      '# commentaire',
      'PORT=3001',
      '',
    ].join('\n');

    expect(deriveWorktreeEnv(content, target)).toBe(
      [
        'DATABASE_URL=postgres://u:secret@localhost:5432/choral_writer_wt_essai',
        'APP_PASSWORD=secret',
        '# commentaire',
        'PORT=3007',
        '',
      ].join('\n'),
    );
  });

  it('conserve les guillemets et les fins de ligne Windows', () => {
    const content = 'DATABASE_URL="postgres://u@h/dev"\r\nPORT=3001\r\n';
    expect(deriveWorktreeEnv(content, target)).toBe(
      'DATABASE_URL="postgres://u@h/choral_writer_wt_essai"\r\nPORT=3007\r\n',
    );
  });

  it('ajoute PORT quand il est absent', () => {
    expect(deriveWorktreeEnv('DATABASE_URL=postgres://u@h/dev\n', target)).toBe(
      'DATABASE_URL=postgres://u@h/choral_writer_wt_essai\nPORT=3007\n',
    );
  });

  it('échoue sans DATABASE_URL', () => {
    expect(() => deriveWorktreeEnv('PORT=3001\n', target)).toThrow(/DATABASE_URL/);
  });
});

describe('nextUnreservedPort', () => {
  it('saute les ports déjà attribués', () => {
    expect(nextUnreservedPort(new Set([3002, 3003, 3005]), 3002)).toBe(3004);
  });

  it('renvoie le port de départ s’il est libre', () => {
    expect(nextUnreservedPort(new Set([3001]), 3002)).toBe(3002);
  });
});
