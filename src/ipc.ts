import { Channel, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { isNotOpen } from './errors';
import { EVENTS } from './generated/events';
import type {
  AccountView,
  CloneStepView,
  DeviceView,
  PullCardView,
  PullListView,
  RepoListingView,
  ChangedFileView,
  DiffSides,
  ErrorView,
  Operation,
  OperationOutcome,
  PathOperation,
  Progress,
  RecentRepo,
  RefKind,
  RepoView,
  TipView,
  WindowView,
  WorkingTreeView,
  WorktreeView,
} from './types';

export const openRepo = (path: string) => invoke<RepoView>('open_repo', { path });

const stillOpen = async <T>(repo: string, call: () => Promise<T>): Promise<T> => {
  try {
    return await call();
  } catch (error) {
    if (!isNotOpen(error)) throw error;
    await openRepo(repo);
    return call();
  }
};

export const closeRepo = (repo: string) => invoke<void>('close_repo', { repo });

export const openRepos = () => invoke<string[]>('open_repos');

export const graphWindow = (repo: string, start: number, len: number) =>
  stillOpen(repo, () => invoke<WindowView>('graph_window', { repo, start, len }));

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
  return invoke<OperationOutcome>('run_operation', {
    repo,
    operation,
    progress,
  });
};

export const onRepoChanged = (handler: (repo: string) => void) =>
  listen<string>(EVENTS.repoChanged, (event) => handler(event.payload));

export const onWorktreeChanged = (handler: (repo: string) => void) =>
  listen<string>(EVENTS.worktreeChanged, (event) => handler(event.payload));

export const refreshTip = (repo: string) =>
  stillOpen(repo, () => invoke<TipView>('refresh_tip', { repo }));

export const commitFiles = (repo: string, commit: string) =>
  invoke<ChangedFileView[]>('commit_files', { repo, commit });

export const diffSides = (repo: string, commit: string, path: string, oldPath: string | null) =>
  invoke<DiffSides>('diff_sides', { repo, commit, path, oldPath });

export const workingTree = (repo: string) => invoke<WorkingTreeView>('working_tree', { repo });

export const stage = (repo: string, operation: PathOperation) =>
  invoke<WorkingTreeView>('stage', { repo, operation });

export const workingTreeDiff = (repo: string, path: string, staged: boolean) =>
  invoke<DiffSides>('working_tree_diff', { repo, path, staged });

export const commit = (repo: string, message: string) =>
  invoke<WorkingTreeView>('commit', { repo, message });

export const startConnect = (host: string) => invoke<DeviceView>('start_connect', { host });

export const onHostConnected = (handler: (account: AccountView) => void) =>
  listen<AccountView>(EVENTS.hostConnected, (event) => handler(event.payload));

export const onHostFailed = (handler: (error: ErrorView) => void) =>
  listen<ErrorView>(EVENTS.hostFailed, (event) => handler(event.payload));

export const hostAccount = (host: string) => invoke<AccountView | null>('host_account', { host });

export const disconnectHost = (host: string) => invoke<void>('disconnect_host', { host });

export const hostRepos = (host: string, refresh: boolean) =>
  invoke<RepoListingView[]>('host_repos', { host, refresh });

export const defaultCloneDir = () => invoke<string>('default_clone_dir');

export const cloneRepo = (
  url: string,
  parent: string,
  name: string,
  onStep: (step: CloneStepView) => void,
) => {
  const progress = new Channel<CloneStepView>();
  progress.onmessage = onStep;
  return invoke<string>('clone_repo', { url, parent, name, progress });
};

export const initRepo = (path: string) => invoke<string>('init_repo', { path });

export const openTerminal = (repo: string) => invoke<void>('open_terminal', { repo });

export const openInEditor = (path: string) => invoke<void>('open_in_editor', { path });

export const searchCommits = (repo: string, query: string) =>
  stillOpen(repo, () => invoke<number[]>('search_commits', { repo, query }));

export const pullRequests = (repo: string, refresh: boolean, network: boolean) =>
  invoke<PullListView | null>('pull_requests', { repo, refresh, network });

export const pullCard = (repo: string, number: number) =>
  invoke<PullCardView>('pull_card', { repo, number });

export const checkoutPull = (repo: string, number: number, branch: string, fromFork: boolean) =>
  invoke<void>('checkout_pull', { repo, number, branch, fromFork });

export const checkoutRef = (repo: string, name: string, kind: RefKind) =>
  invoke<void>('checkout_ref', { repo, name, kind });

export const avatarPaths = (repo: string) =>
  invoke<Record<string, string>>('avatar_paths', { repo });

export const resolveAvatars = (repo: string) => invoke<void>('resolve_avatars', { repo });

export const onAvatarsChanged = (handler: (repo: string) => void) =>
  listen<string>(EVENTS.avatarsChanged, (event) => handler(event.payload));
