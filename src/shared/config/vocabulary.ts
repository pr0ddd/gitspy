import type { IconName } from '@/shared/ui/icons';

import type { Operation } from '@/shared/api/types';

export const KEYS = {
  command: '⌘',
  ctrl: 'Ctrl',
  shiftSign: '⇧',
  shiftWord: 'Shift',
  altSign: '⌥',
  altWord: 'Alt',
  enterSign: '↩',
  enterWord: 'Enter',
  escape: 'Esc',
  space: 'Space',
  tab: 'Tab',
  home: 'Home',
  end: 'End',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
} as const;

export type ExchangeMove = 'fetch' | 'pull' | 'push';

export const EXCHANGE_ACTIONS: ReadonlyArray<{
  move: ExchangeMove;
  label: string;
  icon: IconName;
}> = [
  { move: 'fetch', label: 'toolbar.fetch', icon: 'fetch' },
  { move: 'pull', label: 'toolbar.pull', icon: 'pull' },
  { move: 'push', label: 'toolbar.push', icon: 'push' },
];

export const TOOLBAR_ACTIONS: ReadonlyArray<{
  label: string;
  icon: IconName;
  operation?: Operation;
  asks?: 'branch' | 'stash';
  terminal?: true;
}> = [
  { label: 'toolbar.branch', icon: 'branch', asks: 'branch' },
  { label: 'toolbar.stash', icon: 'stash', asks: 'stash' },
  { label: 'toolbar.pop', icon: 'stash', operation: { kind: 'stashPop' } },
  { label: 'toolbar.terminal', icon: 'terminal', terminal: true },
];

export type PullMode = 'fetch' | 'pull' | 'pullFfOnly' | 'pullRebase';

export const PULL_CHOICES: ReadonlyArray<{ mode: PullMode; label: string }> = [
  { mode: 'fetch', label: 'pull.fetchAll' },
  { mode: 'pull', label: 'pull.default' },
  { mode: 'pullFfOnly', label: 'pull.ffOnly' },
  { mode: 'pullRebase', label: 'pull.rebase' },
];
