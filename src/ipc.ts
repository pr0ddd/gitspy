import { Channel, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  ChangedFileView,
  DiffSides,
  Operation,
  OperationOutcome,
  Progress,
  RecentRepo,
  RepoView,
  WindowView,
  WorktreeView,
} from './types';

export const openRepo = (path: string) => invoke<RepoView>('open_repo', { path });

export const closeRepo = (repo: string) => invoke<void>('close_repo', { repo });

export const openRepos = () => invoke<string[]>('open_repos');

export const graphWindow = (repo: string, start: number, len: number) =>
  invoke<WindowView>('graph_window', { repo, start, len });

export const worktrees = (repo: string) => invoke<WorktreeView[]>('worktrees', { repo });

export const recentRepos = () => invoke<RecentRepo[]>('recent_repos');

export const forgetRepo = (path: string) => invoke<RecentRepo[]>('forget_repo', { path });

export const runOperation = (
  repo: string,
  operation: Operation,
  onProgress: (event: Progress) => void,
) => {
  const progress = new Channel<Progress>();
  progress.onmessage = onProgress;
  return invoke<OperationOutcome>('run_operation', { repo, operation, progress });
};

export const onRepoChanged = (handler: (repo: string) => void) =>
  listen<string>('repo:changed', (event) => handler(event.payload));

export const commitFiles = (repo: string, commit: string) =>
  invoke<ChangedFileView[]>('commit_files', { repo, commit });

export const diffSides = (repo: string, commit: string, path: string, oldPath: string | null) =>
  invoke<DiffSides>('diff_sides', { repo, commit, path, oldPath });
