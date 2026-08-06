import type { Chip } from '@/entities/graph';
import type { Ask } from '@/widgets/AskBar';
import type { PathOperation, Operation, RefView } from '@/types';
import type { HideableColumn } from '@/entities/graph';

export type MenuAction =
  | { kind: 'checkoutRef'; ref: RefView }
  | { kind: 'run'; operation: Operation }
  | { kind: 'pathRun'; operation: PathOperation }
  | { kind: 'copy'; text: string }
  | { kind: 'ask'; ask: Ask }
  | { kind: 'worktree'; at: string }
  | { kind: 'openUrl'; url: string }
  | { kind: 'ignore'; pattern: string }
  | { kind: 'history'; path: string }
  | { kind: 'openFile'; path: string }
  | { kind: 'reveal'; path: string }
  | { kind: 'copyPatch'; path: string; staged: boolean }
  | { kind: 'copyCommitPatch'; commit: string; path: string }
  | { kind: 'deleteFile'; path: string }
  | { kind: 'toggleColumn'; column: HideableColumn }
  | { kind: 'toggleCompact' }
  | { kind: 'resetLayout' };

export type MenuItem = {
  readonly id: string;
  readonly label: string;
  readonly params?: Record<string, string>;
  readonly danger?: boolean;
  readonly checked?: boolean;
  readonly action?: MenuAction;
  readonly children?: MenuItem[];
};

export type MenuSection = MenuItem[];

export type MenuContext = {
  readonly currentBranch: string | null;
  readonly remotes: readonly { name: string; webUrl: string | null }[];
  readonly head: { oid: string; subject: string; body: string } | null;
};

const splitByRemote = (
  full: string,
  remotes: MenuContext['remotes'],
): { remote: string; rest: string } | null => {
  const owner = remotes
    .filter((r) => full.startsWith(`${r.name}/`))
    .reduce<string | null>(
      (longest, r) => (longest && longest.length >= r.name.length ? longest : r.name),
      null,
    );
  return owner ? { remote: owner, rest: full.slice(owner.length + 1) } : null;
};

const webUrlOf = (remote: string | null, ctx: MenuContext): string | null =>
  ctx.remotes.find((r) => r.name === remote)?.webUrl ?? null;

const resetSubmenu = (hash: string, current: string): MenuItem => ({
  id: 'reset',
  label: 'menu.reset',
  params: { current },
  children: (['soft', 'mixed', 'hard'] as const).map((mode) => ({
    id: `reset${mode[0].toUpperCase()}${mode.slice(1)}`,
    label: `menu.reset${mode[0].toUpperCase()}${mode.slice(1)}`,
    danger: mode === 'hard',
    action: { kind: 'run', operation: { kind: 'reset', hash, mode } },
  })),
});

const growth = (hash: string): MenuSection => [
  {
    id: 'branchHere',
    label: 'menu.branchHere',
    action: { kind: 'ask', ask: { kind: 'branchAt', hash } },
  },
  {
    id: 'tagHere',
    label: 'menu.tagHere',
    action: { kind: 'ask', ask: { kind: 'tagAt', hash } },
  },
  {
    id: 'annotatedTagHere',
    label: 'menu.annotatedTagHere',
    action: { kind: 'ask', ask: { kind: 'annotatedTagAt', hash } },
  },
];

const surgery = (hash: string, withDrop: boolean, ctx: MenuContext): MenuSection => [
  {
    id: 'cherryPick',
    label: 'menu.cherryPick',
    action: { kind: 'run', operation: { kind: 'cherryPick', hash } },
  },
  {
    id: 'revert',
    label: 'menu.revert',
    action: { kind: 'run', operation: { kind: 'revert', hash } },
  },
  ...(withDrop
    ? [
        {
          id: 'drop',
          label: 'menu.drop',
          danger: true,
          action: { kind: 'run' as const, operation: { kind: 'drop' as const, hash } },
        },
        ...(ctx.currentBranch
          ? [
              {
                id: 'rebaseOntoCommit',
                label: 'menu.rebaseOntoCommit',
                params: { current: ctx.currentBranch },
                action: {
                  kind: 'run' as const,
                  operation: { kind: 'rebase' as const, onto: hash },
                },
              },
            ]
          : []),
      ]
    : []),
];

const commitCopies = (hash: string, webUrl: string | null): MenuSection => [
  { id: 'copySha', label: 'menu.copySha', action: { kind: 'copy', text: hash } },
  ...(webUrl
    ? [
        {
          id: 'copyLinkCommit',
          label: 'menu.copyLinkCommit',
          action: { kind: 'copy' as const, text: `${webUrl}/commit/${hash}` },
        },
      ]
    : []),
];

export function buildChipMenu(chip: Chip, ctx: MenuContext): MenuSection[] {
  const main = chip.refs[0];
  if (!main) return [];

  if (chip.kind === 'stash') return [];
  if (chip.kind === 'tag') {
    return [
      [{ id: 'copyBranch', label: 'menu.copyBranch', action: { kind: 'copy', text: main.name } }],
    ];
  }

  const local = chip.kind === 'localBranch';
  const remotePart = local ? null : splitByRemote(main.name, ctx.remotes);
  const upstreamPart = main.upstream ? splitByRemote(main.upstream, ctx.remotes) : null;
  const branchWebUrl = webUrlOf(remotePart?.remote ?? upstreamPart?.remote ?? null, ctx);
  const anyWebUrl = branchWebUrl ?? webUrlOf(ctx.remotes[0]?.name ?? null, ctx);
  const branchOnRemote = remotePart?.rest ?? upstreamPart?.rest ?? null;

  const switching: MenuSection = chip.isHead
    ? []
    : [
        {
          id: 'checkout',
          label: 'menu.checkout',
          params: { name: chip.name },
          action: { kind: 'checkoutRef', ref: main },
        },
      ];

  const updating: MenuSection = [];
  if (local && !chip.isHead && upstreamPart) {
    updating.push({
      id: 'pullFf',
      label: 'menu.pullFf',
      params: { name: chip.name },
      action: {
        kind: 'run',
        operation: {
          kind: 'fetchInto',
          remote: upstreamPart.remote,
          from: upstreamPart.rest,
          into: main.name,
        },
      },
    });
  }
  if (local && !chip.isHead && ctx.currentBranch) {
    updating.push({
      id: 'fastForward',
      label: 'menu.fastForward',
      params: { name: chip.name, current: ctx.currentBranch },
      action: {
        kind: 'run',
        operation: {
          kind: 'fetchInto',
          remote: '.',
          from: ctx.currentBranch,
          into: main.name,
        },
      },
    });
  }
  if (local) {
    if (upstreamPart) {
      updating.push({
        id: 'push',
        label: 'menu.push',
        params: { name: chip.name },
        action: {
          kind: 'run',
          operation: { kind: 'pushBranch', remote: upstreamPart.remote, branch: main.name },
        },
      });
    } else if (ctx.remotes.length > 0) {
      updating.push({
        id: 'push',
        label: 'menu.pushSetUpstream',
        params: { name: chip.name, remote: ctx.remotes[0].name },
        action: {
          kind: 'run',
          operation: {
            kind: 'pushSetUpstream',
            remote: ctx.remotes[0].name,
            branch: main.name,
          },
        },
      });
    }
  }

  const weaving: MenuSection =
    local && !chip.isHead && ctx.currentBranch
      ? [
          {
            id: 'merge',
            label: 'menu.merge',
            params: { name: chip.name, current: ctx.currentBranch },
            action: { kind: 'run', operation: { kind: 'merge', branch: main.name } },
          },
          {
            id: 'rebase',
            label: 'menu.rebase',
            params: { name: chip.name, current: ctx.currentBranch },
            action: { kind: 'run', operation: { kind: 'rebase', onto: main.name } },
          },
        ]
      : [];

  const worktrees: MenuSection = [
    {
      id: 'worktree',
      label: 'menu.worktree',
      params: { name: chip.name },
      action: { kind: 'worktree', at: main.name },
    },
  ];

  const commitish: MenuSection = [
    ...growth(main.oid),
    ...surgery(main.oid, false, ctx),
    ...(ctx.currentBranch ? [resetSubmenu(main.oid, ctx.currentBranch)] : []),
  ];

  const bookkeeping: MenuSection = local
    ? [
        {
          id: 'rename',
          label: 'menu.rename',
          params: { name: chip.name },
          action: { kind: 'ask', ask: { kind: 'renameBranch', from: main.name } },
        },
        ...(chip.isHead
          ? []
          : [
              {
                id: 'delete',
                label: 'menu.delete',
                params: { name: chip.name },
                danger: true,
                action: {
                  kind: 'run' as const,
                  operation: { kind: 'branchDelete' as const, name: main.name },
                },
              },
            ]),
      ]
    : remotePart
      ? [
          {
            id: 'deleteRemote',
            label: 'menu.deleteRemote',
            params: { name: remotePart.rest, remote: remotePart.remote },
            danger: true,
            action: {
              kind: 'run',
              operation: {
                kind: 'pushDelete',
                remote: remotePart.remote,
                branch: remotePart.rest,
              },
            },
          },
        ]
      : [];

  const copies: MenuSection = [
    { id: 'copyBranch', label: 'menu.copyBranch', action: { kind: 'copy', text: main.name } },
    ...commitCopies(main.oid, anyWebUrl),
    ...(branchWebUrl && branchOnRemote
      ? [
          {
            id: 'copyLinkBranch',
            label: 'menu.copyLinkBranch',
            action: {
              kind: 'copy' as const,
              text: `${branchWebUrl}/tree/${branchOnRemote}`,
            },
          },
        ]
      : []),
  ];

  const github: MenuSection =
    !local && branchWebUrl && branchOnRemote
      ? [
          {
            id: 'openGitHub',
            label: 'menu.openGitHub',
            action: { kind: 'openUrl', url: `${branchWebUrl}/tree/${branchOnRemote}` },
          },
        ]
      : [];

  return [switching, updating, weaving, worktrees, commitish, bookkeeping, copies, github].filter(
    (s) => s.length > 0,
  );
}

export function buildCommitMenu(hash: string, ctx: MenuContext): MenuSection[] {
  const webUrl = webUrlOf(ctx.remotes[0]?.name ?? null, ctx);

  const moving: MenuSection = [
    {
      id: 'checkoutCommit',
      label: 'menu.checkoutCommit',
      action: { kind: 'run', operation: { kind: 'checkout', branch: hash } },
    },
    {
      id: 'worktree',
      label: 'menu.worktreeCommit',
      action: { kind: 'worktree', at: hash },
    },
  ];

  const editing: MenuSection =
    ctx.head && ctx.head.oid === hash
      ? [
          {
            id: 'editMessage',
            label: 'menu.editMessage',
            action: {
              kind: 'ask',
              ask: {
                kind: 'editMessage',
                full: ctx.head.body ? `${ctx.head.subject}\n\n${ctx.head.body}` : ctx.head.subject,
              },
            },
          },
        ]
      : [];

  const resets: MenuSection = ctx.currentBranch ? [resetSubmenu(hash, ctx.currentBranch)] : [];

  return [
    moving,
    growth(hash),
    [...surgery(hash, true, ctx), ...editing],
    resets,
    commitCopies(hash, webUrl),
  ].filter((s) => s.length > 0);
}

export type FileMenuEntry = {
  readonly path: string;
  readonly staged: boolean;
};

export function buildFileMenu(entry: FileMenuEntry): MenuSection[] {
  const { path, staged } = entry;
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  const extension = dot > 0 ? name.slice(dot + 1) : null;
  const directory = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : null;

  const ignoreChildren: MenuItem[] = [
    {
      id: 'ignoreExact',
      label: 'menu.ignoreExact',
      params: { name },
      action: { kind: 'ignore', pattern: path },
    },
    ...(extension
      ? [
          {
            id: 'ignoreExtension',
            label: 'menu.ignoreExtension',
            params: { extension },
            action: { kind: 'ignore', pattern: `*.${extension}` } as MenuAction,
          },
        ]
      : []),
    ...(directory
      ? [
          {
            id: 'ignoreFolder',
            label: 'menu.ignoreFolder',
            params: { directory: `${directory.slice(directory.lastIndexOf('/') + 1)}/` },
            action: { kind: 'ignore', pattern: `${directory}/` } as MenuAction,
          },
        ]
      : []),
  ];

  return [
    [
      staged
        ? {
            id: 'unstage',
            label: 'workingTree.unstage',
            action: { kind: 'pathRun', operation: { kind: 'unstage', paths: [path] } },
          }
        : {
            id: 'stage',
            label: 'workingTree.stage',
            action: { kind: 'pathRun', operation: { kind: 'stage', paths: [path] } },
          },
      {
        id: 'discard',
        label: 'menu.discardChanges',
        danger: true,
        action: { kind: 'pathRun', operation: { kind: 'discard', paths: [path] } },
      },
      { id: 'ignore', label: 'menu.ignore', children: ignoreChildren },
      {
        id: 'stashFile',
        label: 'menu.stashFile',
        action: { kind: 'run', operation: { kind: 'stashFile', path } },
      },
    ],
    [{ id: 'fileHistory', label: 'menu.fileHistory', action: { kind: 'history', path } }],
    [
      { id: 'openFile', label: 'menu.openFile', action: { kind: 'openFile', path } },
      { id: 'reveal', label: 'menu.reveal', action: { kind: 'reveal', path } },
    ],
    [
      { id: 'copyPath', label: 'menu.copyPath', action: { kind: 'copy', text: path } },
      { id: 'copyPatch', label: 'menu.copyPatch', action: { kind: 'copyPatch', path, staged } },
    ],
    [
      {
        id: 'deleteFile',
        label: 'menu.deleteFile',
        danger: true,
        action: { kind: 'deleteFile', path },
      },
    ],
  ];
}

export function buildCommitFileMenu(commit: string, path: string): MenuSection[] {
  return [
    [{ id: 'fileHistory', label: 'menu.fileHistory', action: { kind: 'history', path } }],
    [
      { id: 'openFile', label: 'menu.openFile', action: { kind: 'openFile', path } },
      { id: 'reveal', label: 'menu.reveal', action: { kind: 'reveal', path } },
    ],
    [
      { id: 'copyPath', label: 'menu.copyPath', action: { kind: 'copy', text: path } },
      {
        id: 'copyPatch',
        label: 'menu.copyPatch',
        action: { kind: 'copyCommitPatch', commit, path },
      },
    ],
  ];
}

const COLUMN_LABEL: Record<HideableColumn, string> = {
  branchTag: 'column.branchTag',
  author: 'column.author',
  date: 'column.date',
  sha: 'column.sha',
};

export function buildColumnsMenu(
  hidden: ReadonlySet<HideableColumn>,
  compact: boolean,
): MenuSection[] {
  return [
    (Object.keys(COLUMN_LABEL) as HideableColumn[]).map((column) => ({
      id: `column:${column}`,
      label: COLUMN_LABEL[column],
      checked: !hidden.has(column),
      action: { kind: 'toggleColumn', column },
    })),
    [
      {
        id: 'compact',
        label: 'menu.compactView',
        checked: compact,
        action: { kind: 'toggleCompact' },
      },
    ],
    [{ id: 'resetLayout', label: 'menu.resetColumns', action: { kind: 'resetLayout' } }],
  ];
}
