import { Channel, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { isNotOpen } from '@/shared/api/errors';
import { EVENTS } from './generated/events';
import type {
  AccountView,
  CloneStepView,
  ConnectStartView,
  ConnectionView,
  TemplateCatalogView,
  PullCardView,
  PullListView,
  RepoListingView,
  BlameSpanView,
  ChangedFileView,
  ConflictFileView,
  FileCommitView,
  DiffSides,
  ErrorView,
  Operation,
  OperationOutcome,
  PathOperation,
  Progress,
  RecentRepo,
  RefKind,
  FoundCommitView,
  RepoPassportView,
  RepoView,
  TipView,
  WindowView,
  WorkingTreeView,
  WorktreeView,
  AiServerView,
  CommitDraftView,
} from '@/shared/api/types';

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

export const favoriteRepo = (path: string, on: boolean) =>
  invoke<RecentRepo[]>('favorite_repo', { path, on });

export const repoPassports = (paths: string[]) =>
  invoke<RepoPassportView[]>('repo_passports', { paths });

export const repositoryRoot = (path: string) => invoke<string | null>('repository_root', { path });

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

export const workingTreeHunks = (repo: string, path: string, staged: boolean) =>
  invoke<string>('working_tree_hunks', { repo, path, staged });

export const commitFileHunks = (repo: string, hash: string, path: string) =>
  invoke<string>('commit_file_hunks', { repo, hash, path });

export const appendIgnore = (repo: string, pattern: string) =>
  invoke<void>('append_ignore', { repo, pattern });

export const openPath = (repo: string, path: string) => invoke<void>('open_path', { repo, path });

export const revealPath = (repo: string, path: string) =>
  invoke<void>('reveal_path', { repo, path });

export const removePath = (repo: string, path: string) =>
  invoke<void>('remove_path', { repo, path });

export const applyHunk = (repo: string, patch: string, cached: boolean, reverse: boolean) =>
  invoke<WorkingTreeView>('apply_hunk', { repo, patch, cached, reverse });

export const fileHistory = (repo: string, path: string, from: string | null) =>
  invoke<FileCommitView[]>('file_history', { repo, path, from });

export const blameFile = (repo: string, path: string, at: string | null) =>
  invoke<BlameSpanView[]>('blame_file', { repo, path, at });

export const writeFile = (repo: string, path: string, content: string) =>
  invoke<WorkingTreeView>('write_file', { repo, path, content });

export const conflictFile = (repo: string, path: string) =>
  invoke<ConflictFileView>('conflict_file', { repo, path });

export const resolveConflict = (repo: string, path: string, content: string) =>
  invoke<WorkingTreeView>('resolve_conflict', { repo, path, content });

export const commit = (repo: string, message: string, amend: boolean) =>
  invoke<WorkingTreeView>('commit', { repo, message, amend });

export const startConnect = (host: string) => invoke<ConnectStartView>('start_connect', { host });

export const connections = () => invoke<ConnectionView[]>('connections');

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
  shallow: boolean,
  onStep: (step: CloneStepView) => void,
) => {
  const progress = new Channel<CloneStepView>();
  progress.onmessage = onStep;
  return invoke<string>('clone_repo', { url, parent, name, shallow, progress });
};

export const hostNamespaces = (host: string) => invoke<string[]>('host_namespaces', { host });

export const hostCreateRepo = (
  host: string,
  namespace: string,
  name: string,
  description: string,
  isPrivate: boolean,
) =>
  invoke<RepoListingView>('host_create_repo', {
    host,
    namespace,
    name,
    description,
    private: isPrivate,
  });

export const seedRepo = (
  path: string,
  branch: string | null,
  gitignore: string | null,
  license: string | null,
  push: boolean,
) => invoke<void>('seed_repo', { path, branch, gitignore, license, push });

export const templateCatalog = () => invoke<TemplateCatalogView>('template_catalog');

export const initRepo = (
  path: string,
  branch: string | null,
  gitignore: string | null,
  license: string | null,
) => invoke<string>('init_repo', { path, branch, gitignore, license });

export const openTerminal = (repo: string) => invoke<void>('open_terminal', { repo });

const bytesOfFrame = (frame: ArrayBuffer | ArrayBufferView): Uint8Array =>
  ArrayBuffer.isView(frame)
    ? new Uint8Array(frame.buffer, frame.byteOffset, frame.byteLength)
    : new Uint8Array(frame);

export const termOpen = (
  cwd: string,
  command: string | null,
  onData: (bytes: Uint8Array) => void,
) => {
  const channel = new Channel<ArrayBuffer | ArrayBufferView>();
  channel.onmessage = (frame) => onData(bytesOfFrame(frame));
  return invoke<number>('term_open', { cwd, command, onData: channel });
};

export const termInput = (id: number, data: string) => invoke<void>('term_input', { id, data });

export const termResize = (id: number, cols: number, rows: number) =>
  invoke<void>('term_resize', { id, cols, rows });

export const termAck = (id: number, bytes: number) => invoke<void>('term_ack', { id, bytes });

export const termKill = (id: number) => invoke<void>('term_kill', { id });

export const setAutofetchMinutes = (minutes: number) =>
  invoke<void>('set_autofetch_minutes', { minutes });

export const openUrl = (url: string) => invoke<void>('open_url', { url });

export const openInEditor = (path: string) => invoke<void>('open_in_editor', { path });

export const searchCommits = (repo: string, query: string) =>
  stillOpen(repo, () => invoke<number[]>('search_commits', { repo, query }));

export const foundCommits = (repo: string, indices: number[]) =>
  stillOpen(repo, () => invoke<FoundCommitView[]>('found_commits', { repo, indices }));

export const pullRequests = (repo: string, refresh: boolean, network: boolean) =>
  invoke<PullListView | null>('pull_requests', { repo, refresh, network });

export const pullCard = (repo: string, number: number) =>
  invoke<PullCardView>('pull_card', { repo, number });

export const checkoutPull = (repo: string, number: number, branch: string, fromFork: boolean) =>
  invoke<string>('checkout_pull', { repo, number, branch, fromFork });

export const checkoutRef = (repo: string, name: string, kind: RefKind) =>
  invoke<string | null>('checkout_ref', { repo, name, kind });

export const avatarPaths = (repo: string) =>
  invoke<Record<string, string>>('avatar_paths', { repo });

export const resolveAvatars = (repo: string) => invoke<void>('resolve_avatars', { repo });

export const onAvatarsChanged = (handler: (repo: string) => void) =>
  listen<string>(EVENTS.avatarsChanged, (event) => handler(event.payload));

export const aiDetectServer = (baseUrl: string) =>
  invoke<AiServerView>('ai_detect_server', { baseUrl });

export const aiGenerateCommit = (repo: string, baseUrl: string, model: string) =>
  invoke<CommitDraftView>('ai_generate_commit', { repo, baseUrl, model });
