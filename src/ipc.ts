import { invoke } from '@tauri-apps/api/core';
import type { RecentRepo, RepoView, WindowView, WorktreeView } from './types';

export const openRepo = (path: string) => invoke<RepoView>('open_repo', { path });

export const closeRepo = (repo: string) => invoke<void>('close_repo', { repo });

export const openRepos = () => invoke<string[]>('open_repos');

export const graphWindow = (repo: string, start: number, len: number) =>
  invoke<WindowView>('graph_window', { repo, start, len });

export const worktrees = (repo: string) => invoke<WorktreeView[]>('worktrees', { repo });

export const recentRepos = () => invoke<RecentRepo[]>('recent_repos');

export const forgetRepo = (path: string) => invoke<RecentRepo[]>('forget_repo', { path });
