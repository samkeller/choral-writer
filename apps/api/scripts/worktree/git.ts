import path from 'node:path';

import { capture, run, succeeds } from './process.js';

export interface WorktreeEntry {
  path: string;
  /** Branche locale extraite, absente pour un worktree détaché. */
  branch?: string;
}

/** Analyse la sortie de `git worktree list --porcelain`. */
export function parseWorktreeList(porcelain: string): WorktreeEntry[] {
  return porcelain
    .split(/\r?\n\r?\n/)
    .map((block) => block.split(/\r?\n/))
    .flatMap((lines) => {
      const worktreeLine = lines.find((line) => line.startsWith('worktree '));
      if (!worktreeLine) return [];
      const branchLine = lines.find((line) => line.startsWith('branch '));
      return [
        {
          path: worktreeLine.slice('worktree '.length),
          branch: branchLine?.slice('branch refs/heads/'.length),
        },
      ];
    });
}

export function samePath(left: string, right: string): boolean {
  const normalize = (value: string) => {
    const resolved = path.resolve(value);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return normalize(left) === normalize(right);
}

/** Dossier du checkout principal, quel que soit le worktree d'où le script est lancé. */
export function mainCheckoutDir(cwd: string): string {
  const commonDir = capture('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    cwd,
  }).trim();
  return path.dirname(commonDir);
}

export function listWorktrees(repoDir: string): WorktreeEntry[] {
  return parseWorktreeList(capture('git', ['worktree', 'list', '--porcelain'], { cwd: repoDir }));
}

export function fetchBase(repoDir: string, base: string): void {
  run('git', ['fetch', 'origin', base], { cwd: repoDir });
}

export function addWorktree(repoDir: string, dir: string, branch: string, base: string): void {
  run('git', ['worktree', 'add', '-b', branch, dir, `origin/${base}`], { cwd: repoDir });
}

/** Vrai si le worktree a des fichiers suivis modifiés ou des fichiers non suivis et non ignorés. */
export function hasLocalChanges(dir: string): boolean {
  return capture('git', ['status', '--porcelain'], { cwd: dir }).trim() !== '';
}

/** Oublie les worktrees dont le dossier a disparu. */
export function pruneWorktrees(repoDir: string): void {
  run('git', ['worktree', 'prune'], { cwd: repoDir });
}

export function isMergedInto(repoDir: string, branch: string, base: string): boolean {
  return succeeds('git', ['merge-base', '--is-ancestor', branch, `origin/${base}`], {
    cwd: repoDir,
  });
}

export function deleteBranch(repoDir: string, branch: string): void {
  run('git', ['branch', '-D', branch], { cwd: repoDir });
}
