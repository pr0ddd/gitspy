import type { IconName } from '@/shared/ui/icons';

export type ViewKey = 'local' | 'remote' | 'worktrees' | 'tags' | 'pullRequests';

export const VIEW_TITLE = {
  local: 'sidebar.local',
  remote: 'sidebar.remote',
  worktrees: 'sidebar.worktrees',
  tags: 'sidebar.tags',
  pullRequests: 'sidebar.pullRequests',
} as const satisfies Record<ViewKey, string>;

export type SidebarTitle = (typeof VIEW_TITLE)[ViewKey];

export const VIEWS: ReadonlyArray<{ key: ViewKey; title: SidebarTitle; icon: IconName }> = [
  { key: 'local', title: VIEW_TITLE.local, icon: 'branch' },
  { key: 'remote', title: VIEW_TITLE.remote, icon: 'remote' },
  { key: 'worktrees', title: VIEW_TITLE.worktrees, icon: 'worktree' },
  { key: 'tags', title: VIEW_TITLE.tags, icon: 'tag' },
  { key: 'pullRequests', title: VIEW_TITLE.pullRequests, icon: 'pullRequest' },
];

export const CAP = 99;
export const ROW_PITCH = 33;
export const OVERSCAN = 8;

export const capped = (count: number) => (count > CAP ? `${CAP}+` : `${count}`);
