import { describe, expect, it } from 'vitest';
import {
  buildChipMenu,
  buildCommitFileMenu,
  buildFileMenu,
  buildCommitMenu,
  type MenuContext,
} from './menuItems';
import { chipsFor } from '@/entities/graph';
import { isDangerous, isDangerousPath } from '@/entities/repo';
import type { RefKind, RefView } from '@/shared/api/types';

const ref = (name: string, kind: RefKind, patch: Partial<RefView> = {}): RefView => ({
  name,
  kind,
  commit: 0,
  oid: 'refoid',
  isHead: false,
  upstream: null,
  ahead: 0,
  behind: 0,
  gone: false,
  ...patch,
});

const CTX: MenuContext = {
  currentBranch: 'main',
  remotes: [{ name: 'origin', webUrl: 'https://github.com/pr0ddd/gitspy' }],
  head: { oid: 'headoid', subject: 'subject', body: 'body' },
};

const chipOf = (r: RefView) => chipsFor([r], ['origin'])[0];

const flat = (sections: ReturnType<typeof buildCommitMenu>) =>
  sections.flat().flatMap((i) => [i, ...(i.children ?? [])]);
const ids = (sections: ReturnType<typeof buildCommitMenu>) => sections.flat().map((i) => i.id);

describe('the local branch menu', () => {
  it('carries checkout, fast-forward, merge, worktree, commit surgery and bookkeeping', () => {
    const menu = buildChipMenu(chipOf(ref('feature', 'localBranch')), CTX);
    expect(ids(menu)).toEqual([
      'checkout',
      'fastForward',
      'push',
      'merge',
      'rebase',
      'worktree',
      'branchHere',
      'tagHere',
      'annotatedTagHere',
      'cherryPick',
      'revert',
      'reset',
      'rename',
      'delete',
      'copyBranch',
      'copySha',
      'copyLinkCommit',
    ]);
  });

  it('gives a branch with an upstream pull, a plain push and a copyable branch link', () => {
    const menu = buildChipMenu(
      chipOf(ref('feature', 'localBranch', { upstream: 'origin/feature' })),
      CTX,
    );
    const found = ids(menu);
    expect(found).toContain('pullFf');
    expect(found).toContain('copyLinkBranch');
    const push = flat(menu).find((i) => i.id === 'push')!;
    expect(
      push.action?.kind === 'run' && push.action.operation.kind,
      'push does not set the upstream again when the branch already has one',
    ).toBe('pushBranch');
  });

  it('makes push set the upstream to the first remote when there is none', () => {
    const menu = buildChipMenu(chipOf(ref('feature', 'localBranch')), CTX);
    const push = flat(menu).find((i) => i.id === 'push')!;
    expect(push.action?.kind === 'run' && push.action.operation.kind).toBe('pushSetUpstream');
  });

  it('offers the current branch no checkout, no fast-forward and no delete, but still a worktree', () => {
    const menu = buildChipMenu(chipOf(ref('main', 'localBranch', { isHead: true })), CTX);
    const found = ids(menu);
    expect(found).not.toContain('checkout');
    expect(found).not.toContain('fastForward');
    expect(found).not.toContain('pullFf');
    expect(found).not.toContain('merge');
    expect(found).not.toContain('delete');
    expect(found).toContain('worktree');
    expect(found).toContain('rename');
  });

  it('offers reset as a submenu of three modes, each saying what it costs', () => {
    const menu = buildChipMenu(chipOf(ref('feature', 'localBranch')), CTX);
    const reset = sectionsItem(menu, 'reset');
    expect(reset.children?.map((c) => c.id)).toEqual(['resetSoft', 'resetMixed', 'resetHard']);
    expect(
      reset.children?.map((c) => c.action?.kind),
      'soft and mixed run at once, hard throws away uncommitted changes and asks first',
    ).toEqual(['run', 'run', 'confirm']);
  });

  it('gives a remote branch checkout, worktree, commit surgery, deletion on the server and GitHub', () => {
    const menu = buildChipMenu(chipOf(ref('origin/dev', 'remoteBranch')), CTX);
    const found = ids(menu);
    expect(found).toContain('checkout');
    expect(found).toContain('worktree');
    expect(found).toContain('deleteRemote');
    expect(found).toContain('openGitHub');
    expect(found).not.toContain('rename');

    const remove = flat(menu).find((i) => i.id === 'deleteRemote')!;
    expect(remove.action?.kind, 'deleting on the server asks first').toBe('confirm');
    expect(
      remove.action?.kind === 'confirm' &&
        remove.action.confirmation.kind === 'operation' &&
        remove.action.confirmation.operation.kind === 'pushDelete' &&
        remove.action.confirmation.operation.branch,
      'the branch deleted on the server is named without the remote prefix',
    ).toBe('dev');

    const open = flat(menu).find((i) => i.id === 'openGitHub')!;
    expect(open.action?.kind === 'openUrl' && open.action.url).toBe(
      'https://github.com/pr0ddd/gitspy/tree/dev',
    );
  });

  it('drops both the links and GitHub when the remote has no web URL', () => {
    const bare: MenuContext = { ...CTX, remotes: [{ name: 'origin', webUrl: null }] };
    const found = ids(buildChipMenu(chipOf(ref('origin/dev', 'remoteBranch')), bare));
    expect(found).not.toContain('openGitHub');
    expect(found).not.toContain('copyLinkCommit');
  });
});

describe('the commit menu', () => {
  it('carries checkout, worktree, branch and tag creation, commit surgery, reset and copies', () => {
    const menu = buildCommitMenu('abc123', CTX);
    expect(ids(menu)).toEqual([
      'checkoutCommit',
      'worktree',
      'branchHere',
      'tagHere',
      'annotatedTagHere',
      'cherryPick',
      'revert',
      'drop',
      'rebaseOntoCommit',
      'reset',
      'copySha',
      'copyLinkCommit',
    ]);
  });

  it('drop asks first: it rewrites history', () => {
    expect(flatItem(buildCommitMenu('abc123', CTX), 'drop').action?.kind).toBe('confirm');
  });

  it('lets the message be edited only on the HEAD commit', () => {
    const onHead = buildCommitMenu('headoid', CTX);
    const edit = flatItem(onHead, 'editMessage');
    expect(
      edit.action?.kind === 'ask' && edit.action.ask.kind === 'editMessage' && edit.action.ask.full,
      'the old message is prefilled whole, the body is not lost',
    ).toBe('subject\n\nbody');

    expect(ids(buildCommitMenu('abc123', CTX))).not.toContain('editMessage');
  });

  it('grows the worktree from this very commit', () => {
    const wt = flatItem(buildCommitMenu('abc123', CTX), 'worktree');
    expect(wt.action?.kind === 'worktree' && wt.action.at).toBe('abc123');
  });
});

const sectionsItem = (sections: ReturnType<typeof buildCommitMenu>, id: string) =>
  sections.flat().find((i) => i.id === id)!;

const flatItem = (sections: ReturnType<typeof buildCommitMenu>, id: string) =>
  flat(sections).find((i) => i.id === id)!;

describe('the working tree file menu', () => {
  it('offers stage for an unstaged file and unstage for a staged one', () => {
    const ids = (staged: boolean) =>
      buildFileMenu({ path: 'src/a.ts', staged })
        .flat()
        .map((item) => item.id);

    expect(ids(false)).toContain('stage');
    expect(ids(false)).not.toContain('unstage');
    expect(ids(true)).toContain('unstage');
    expect(ids(true)).not.toContain('stage');
  });

  it('offers ignore by the exact path, by the extension and by the folder', () => {
    const ignore = buildFileMenu({ path: 'crates/core/src/dump.rs', staged: false })
      .flat()
      .find((item) => item.id === 'ignore');

    expect(
      ignore?.children?.map((child) =>
        child.action?.kind === 'ignore' ? child.action.pattern : '',
      ),
    ).toEqual(['crates/core/src/dump.rs', '*.rs', 'crates/core/src/']);
  });

  it('offers no empty patterns for a file at the root without an extension', () => {
    const ignore = buildFileMenu({ path: 'sandbox', staged: false })
      .flat()
      .find((item) => item.id === 'ignore');

    expect(ignore?.children?.length, 'only the exact path is left').toBe(1);
  });

  it('marks the destructive items and keeps them in a section of their own', () => {
    const sections = buildFileMenu({ path: 'src/a.ts', staged: false });
    const last = sections[sections.length - 1];

    expect(last.map((item) => item.id)).toEqual(['deleteFile']);
    expect(last[0].action?.kind, 'deleting from disk asks first').toBe('confirm');
  });
});

describe('every destructive action asks first', () => {
  const everyMenu = () => [
    ...buildChipMenu(chipOf(ref('feature', 'localBranch')), CTX),
    ...buildChipMenu(chipOf(ref('main', 'localBranch', { isHead: true })), CTX),
    ...buildChipMenu(chipOf(ref('origin/dev', 'remoteBranch')), CTX),
    ...buildChipMenu(chipOf(ref('v1', 'tag')), CTX),
    ...buildCommitMenu('abc123', CTX),
    ...buildCommitMenu('headoid', CTX),
    ...buildFileMenu({ path: 'src/a.ts', staged: false }),
    ...buildFileMenu({ path: 'src/a.ts', staged: true }),
    ...buildCommitFileMenu('abc123', 'src/a.ts'),
  ];

  it('no menu runs a dangerous operation without the confirm bar', () => {
    for (const item of flat(everyMenu())) {
      const action = item.action;
      if (!action) continue;
      if (action.kind === 'run') {
        expect(
          isDangerous(action.operation),
          `${item.id} runs ${action.operation.kind} straight away`,
        ).toBe(false);
      }
      if (action.kind === 'pathRun') {
        expect(
          isDangerousPath(action.operation),
          `${item.id} runs ${action.operation.kind} on paths straight away`,
        ).toBe(false);
      }
    }
  });

  it('and the ones that ask are exactly the destructive ones', () => {
    const asking = flat(everyMenu())
      .filter((item) => item.action?.kind === 'confirm')
      .map((item) => item.id);
    expect(new Set(asking)).toEqual(
      new Set(['resetHard', 'drop', 'delete', 'deleteRemote', 'discard', 'deleteFile']),
    );
  });
});

describe('the commit file menu', () => {
  it('offers history, open, path and patch — no stage, no delete', () => {
    const ids = buildCommitFileMenu('abc123', 'src/a.ts')
      .flat()
      .map((item) => item.id);

    expect(ids).toEqual(['fileHistory', 'openFile', 'reveal', 'copyPath', 'copyPatch']);
  });

  it('remembers which commit the patch is cut from', () => {
    const patch = buildCommitFileMenu('abc123', 'src/a.ts')
      .flat()
      .find((item) => item.id === 'copyPatch');

    expect(patch?.action).toEqual({ kind: 'copyCommitPatch', commit: 'abc123', path: 'src/a.ts' });
  });
});
