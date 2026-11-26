import { describe, expect, it } from 'vitest';

import { parseWorktreeList } from './git.js';

describe('parseWorktreeList', () => {
  it('lit le chemin et la branche de chaque worktree, détachés compris', () => {
    const porcelain = [
      'worktree D:/dev/choral-writer',
      'HEAD 8c89fb9',
      'branch refs/heads/feat/v2',
      '',
      'worktree D:/dev/choral-wt/revue',
      'HEAD 487fd39',
      'detached',
      '',
    ].join('\n');

    expect(parseWorktreeList(porcelain)).toEqual([
      { path: 'D:/dev/choral-writer', branch: 'feat/v2' },
      { path: 'D:/dev/choral-wt/revue', branch: undefined },
    ]);
  });
});
