import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  checkReport, FIRST_TURN_PATH, FRICTION_CHECKS, frictionReport, pathReport, V2_TEAM_PATH, type SourceReader,
} from './friction.js';

const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const readRepository: SourceReader = (file) => {
  try {
    return readFileSync(join(repositoryRoot, file), 'utf8');
  } catch {
    return null;
  }
};

describe('friction', () => {
  it('finds the code behind every counted action of this branch', () => {
    // A failure here means the UI path changed: update the path, and the count it reports, with it.
    expect(pathReport(FIRST_TURN_PATH, readRepository)).toMatchObject({ actions: 6, unconfirmed: [] });
    expect(pathReport(V2_TEAM_PATH, readRepository)).toMatchObject({ actions: 21, unconfirmed: [] });
    expect(FRICTION_CHECKS.map((check) => checkReport(check, readRepository).holds)).toEqual([true, true, true]);
  });

  it('flags the actions whose code is gone instead of counting them silently', () => {
    const report = pathReport(FIRST_TURN_PATH, (file) => file.endsWith('MessageComposer.tsx') ? '' : readRepository(file));
    expect(report.actions).toBe(6);
    expect(report.unconfirmed).toEqual(['Écrire la saisie', 'Cliquer « Envoyer »']);
  });

  it('reports an unreadable reference as unknown, not as a failed check', () => {
    const unreadable: SourceReader = () => null;
    expect(checkReport(FRICTION_CHECKS[0]!, unreadable).holds).toBeNull();
    expect(frictionReport(readRepository, unreadable).firstTurn.v1.unconfirmed).toHaveLength(6);
  });
});
