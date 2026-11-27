import path from 'node:path';

import { samePath, type WorktreeEntry } from './git.js';

/** État observé avant `wt:remove`, sans effet de bord. */
export interface RemovalState {
  mainDir: string;
  parentDir: string;
  worktreeDir: string;
  /** Sortie de `git worktree list` : la première entrée est toujours le checkout principal. */
  worktrees: readonly WorktreeEntry[];
  dirExists: boolean;
  /** `undefined` quand git ne peut plus lire le dossier (suppression interrompue). */
  hasLocalChanges: boolean | undefined;
  /** Branche visée quand aucun worktree n'est enregistré : `--branch`, sinon `feat/<nom>`. */
  fallbackBranch: string;
  fallbackBranchExists: boolean;
  isMerged: (branch: string) => boolean;
  force: boolean;
}

export interface RemovalPlan {
  removeDir: boolean;
  branch?: string;
}

function isSameOrInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * Décide ce que `wt:remove` peut supprimer. Le dossier, la base et la branche ne sont
 * supprimés que pour un worktree secondaire enregistré dans le dossier parent prévu ;
 * sans worktree enregistré (relance après un échec partiel), il faut `--force`.
 */
export function planRemoval(state: RemovalState): RemovalPlan {
  const { mainDir, parentDir, worktreeDir, worktrees, force } = state;

  if (isSameOrInside(mainDir, worktreeDir)) {
    throw new Error(`Refus : ${worktreeDir} contient le checkout principal.`);
  }
  if (!isSameOrInside(worktreeDir, parentDir) || samePath(worktreeDir, parentDir)) {
    throw new Error(`Refus : ${worktreeDir} est hors du dossier des worktrees ${parentDir}.`);
  }

  const [main, ...secondaries] = worktrees;
  if (main && samePath(main.path, worktreeDir)) {
    throw new Error(`Refus : ${worktreeDir} est le checkout principal.`);
  }
  const entry = secondaries.find((worktree) => samePath(worktree.path, worktreeDir));

  if (!entry) {
    if (state.dirExists) {
      throw new Error(`${worktreeDir} n'est pas un worktree enregistré du dépôt : refus.`);
    }
    if (!force) {
      throw new Error(
        `Aucun worktree enregistré dans ${worktreeDir}. Pour supprimer ce qui reste (base, branche ${state.fallbackBranch}), relancer avec --force.`,
      );
    }
    const checkedOut = worktrees.some((worktree) => worktree.branch === state.fallbackBranch);
    return {
      removeDir: false,
      branch: state.fallbackBranchExists && !checkedOut ? state.fallbackBranch : undefined,
    };
  }

  if (!force) {
    if (state.dirExists && state.hasLocalChanges === undefined) {
      throw new Error(
        `${worktreeDir} est illisible pour git (suppression interrompue ?) ; relancer avec --force.`,
      );
    }
    if (state.hasLocalChanges) {
      throw new Error(
        `${worktreeDir} contient des modifications non commitées ; relancer avec --force pour les perdre.`,
      );
    }
    if (entry.branch && !state.isMerged(entry.branch)) {
      throw new Error(
        `La branche ${entry.branch} n'est pas fusionnée ; relancer avec --force pour la supprimer quand même.`,
      );
    }
  }
  return { removeDir: state.dirExists, branch: entry.branch };
}
