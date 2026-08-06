export const GIT = {
  local: 'Local',
  remote: 'Remote',
  worktrees: 'Worktrees',
  tags: 'Tags',
  pullRequests: 'Pull Requests',
  issues: 'Issues',
  commit: 'Commit',
  branch: 'Branch',
  clone: 'Clone',
  fetch: 'Fetch',
  pull: 'Pull',
  push: 'Push',
  stash: 'Stash',
  pop: 'Pop',
  terminal: 'Terminal',
  graph: 'Graph',
  branchTag: 'Branch / Tag',
  commitMessage: 'Commit Message',
  sha: 'SHA',
  workingTree: '// WIP',
} as const;

import type { IconName } from '@/icons';

import type { Operation } from '@/types';

export type ExchangeMove = 'fetch' | 'pull' | 'push';

export const EXCHANGE_ACTIONS: ReadonlyArray<{
  move: ExchangeMove;
  label: string;
  icon: IconName;
}> = [
  { move: 'fetch', label: GIT.fetch, icon: 'fetch' },
  { move: 'pull', label: GIT.pull, icon: 'pull' },
  { move: 'push', label: GIT.push, icon: 'push' },
];

export const TOOLBAR_ACTIONS: ReadonlyArray<{
  label: string;
  icon: IconName;
  operation?: Operation;
  asks?: 'branch' | 'stash';
  terminal?: true;
}> = [
  { label: GIT.branch, icon: 'branch', asks: 'branch' },
  { label: GIT.stash, icon: 'stash', asks: 'stash' },
  { label: GIT.pop, icon: 'stash', operation: { kind: 'stashPop' } },
  { label: GIT.terminal, icon: 'terminal', terminal: true },
];

export type PullMode = 'fetch' | 'pull' | 'pullFfOnly' | 'pullRebase';

export const PULL_CHOICES: ReadonlyArray<{ mode: PullMode; label: string }> = [
  { mode: 'fetch', label: 'pull.fetchAll' },
  { mode: 'pull', label: 'pull.default' },
  { mode: 'pullFfOnly', label: 'pull.ffOnly' },
  { mode: 'pullRebase', label: 'pull.rebase' },
];
