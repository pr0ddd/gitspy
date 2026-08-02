export const GIT = {
  local: 'Local',
  remote: 'Remote',
  worktrees: 'Worktrees',
  stashes: 'Stashes',
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
} as const;

import type { IconName } from './icons';

import type { Operation } from './types';

export const TOOLBAR_ACTIONS: ReadonlyArray<{
  label: string;
  icon: IconName;
  operation?: Operation;
}> = [
  { label: GIT.fetch, icon: 'fetch', operation: 'fetchDryRun' },
  { label: GIT.pull, icon: 'pull' },
  { label: GIT.push, icon: 'push' },
  { label: GIT.branch, icon: 'branch' },
  { label: GIT.stash, icon: 'stash' },
  { label: GIT.pop, icon: 'stash' },
  { label: GIT.terminal, icon: 'terminal' },
];
