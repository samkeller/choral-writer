import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { planRemoval, type RemovalState } from './removalPlan.js';

const mainDir = path.resolve('/dev/choral-writer');
const parentDir = path.resolve('/dev/choral-wt');
const worktreeDir = path.join(parentDir, 'essai');

function state(overrides: Partial<RemovalState> = {}): RemovalState {
  return {
    mainDir,
    parentDir,
    worktreeDir,
    worktrees: [
      { path: mainDir, branch: 'feat/v2' },
      { path: worktreeDir, branch: 'feat/essai' },
    ],
    dirExists: true,
    hasLocalChanges: false,
    fallbackBranch: 'feat/essai',
    fallbackBranchExists: true,
    isMerged: () => true,
    force: false,
    ...overrides,
  };
}

describe('planRemoval', () => {
  it('supprime un worktree secondaire propre et fusionné', () => {
    expect(planRemoval(state())).toEqual({ removeDir: true, branch: 'feat/essai' });
  });

  describe('protège le checkout principal', () => {
    it.each([true, false])('refuse de le cibler, même avec --force=%s', (force) => {
      const target = { worktreeDir: mainDir, parentDir: path.dirname(mainDir), force };
      expect(() => planRemoval(state(target))).toThrow(/checkout principal/);
    });

    it('refuse un dossier qui le contient', () => {
      const target = { worktreeDir: path.dirname(mainDir), parentDir: path.resolve('/'), force: true };
      expect(() => planRemoval(state(target))).toThrow(/checkout principal/);
    });

    it('refuse la première entrée de git worktree list', () => {
      const elsewhere = path.join(parentDir, 'principal');
      const worktrees = [{ path: elsewhere, branch: 'feat/v2' }];
      expect(() =>
        planRemoval(state({ mainDir: path.resolve('/ailleurs'), worktreeDir: elsewhere, worktrees, force: true })),
      ).toThrow(/checkout principal/);
    });
  });

  it('refuse un chemin hors du dossier parent prévu', () => {
    const outside = path.resolve('/autre/essai');
    expect(() => planRemoval(state({ worktreeDir: outside, force: true }))).toThrow(
      /hors du dossier/,
    );
  });

  it('refuse un dossier existant qui n’est pas un worktree enregistré', () => {
    const worktrees = [{ path: mainDir, branch: 'feat/v2' }];
    expect(() => planRemoval(state({ worktrees, force: true }))).toThrow(/pas un worktree/);
  });

  describe('sans worktree enregistré ni dossier', () => {
    const orphan = { worktrees: [{ path: mainDir, branch: 'feat/v2' }], dirExists: false };

    it('ne supprime rien sans --force, ni la base', () => {
      expect(() => planRemoval(state(orphan))).toThrow(/relancer avec --force/);
    });

    it('nettoie la base et la branche orpheline avec --force', () => {
      expect(planRemoval(state({ ...orphan, force: true }))).toEqual({
        removeDir: false,
        branch: 'feat/essai',
      });
    });

    it('ne supprime pas une branche extraite dans un autre worktree', () => {
      const worktrees = [
        { path: mainDir, branch: 'feat/v2' },
        { path: path.join(parentDir, 'autre'), branch: 'feat/essai' },
      ];
      expect(planRemoval(state({ ...orphan, worktrees, force: true }))).toEqual({
        removeDir: false,
        branch: undefined,
      });
    });
  });

  it('refuse des modifications non commitées sans --force', () => {
    expect(() => planRemoval(state({ hasLocalChanges: true }))).toThrow(/non commitées/);
    expect(planRemoval(state({ hasLocalChanges: true, force: true })).removeDir).toBe(true);
  });

  it('refuse un dossier illisible par git sans --force', () => {
    expect(() => planRemoval(state({ hasLocalChanges: undefined }))).toThrow(/--force/);
  });

  it('refuse une branche non fusionnée sans --force', () => {
    expect(() => planRemoval(state({ isMerged: () => false }))).toThrow(/pas fusionnée/);
    expect(planRemoval(state({ isMerged: () => false, force: true })).branch).toBe('feat/essai');
  });

  it('accepte un worktree enregistré dont le dossier a disparu', () => {
    expect(planRemoval(state({ dirExists: false }))).toEqual({
      removeDir: false,
      branch: 'feat/essai',
    });
  });
});
