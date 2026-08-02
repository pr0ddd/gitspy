import {
  Archive,
  CircleDot,
  CloudDownload,
  Copy,
  Download,
  FolderOpen,
  FolderTree,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  Cloud,
  Plus,
  RefreshCw,
  Search,
  Tag,
  Terminal,
  Upload,
  X,
} from 'lucide-react';

export const Icon = {
  branch: GitBranch,
  remote: Cloud,
  worktree: FolderTree,
  stash: Archive,
  tag: Tag,
  pullRequest: GitPullRequest,
  issue: CircleDot,
  commit: GitCommitHorizontal,

  fetch: RefreshCw,
  pull: Download,
  push: Upload,
  clone: CloudDownload,
  terminal: Terminal,

  open: FolderOpen,
  add: Plus,
  close: X,
  search: Search,
  copy: Copy,
} as const;

export type IconName = keyof typeof Icon;
