import { describe, expect, it } from 'vitest';
import { buildChipMenu, buildCommitMenu, type MenuContext } from './menuItems';
import { chipsFor } from './chips';
import type { RefKind, RefView } from './types';

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
  head: { oid: 'headoid', subject: 'тема', body: 'тело' },
};

const chipOf = (r: RefView) => chipsFor([r], ['origin'])[0];

const flat = (sections: ReturnType<typeof buildCommitMenu>) =>
  sections.flat().flatMap((i) => [i, ...(i.children ?? [])]);
const ids = (sections: ReturnType<typeof buildCommitMenu>) =>
  sections.flat().map((i) => i.id);

describe('меню локальной ветки', () => {
  it('несёт переключение, обновление, слияние, worktree, хирургию коммита и учёт', () => {
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

  it('ветка с upstream получает pull и обычный push, ссылка на ветку копируется', () => {
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
      'push с настроенным upstream не пересоздаёт связь',
    ).toBe('pushBranch');
  });

  it('без upstream push сразу настраивает связь с первым remote', () => {
    const menu = buildChipMenu(chipOf(ref('feature', 'localBranch')), CTX);
    const push = flat(menu).find((i) => i.id === 'push')!;
    expect(push.action?.kind === 'run' && push.action.operation.kind).toBe('pushSetUpstream');
  });

  it('текущая ветка не переключается, не обновляется и не удаляется, но worktree можно', () => {
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

  it('сброс — подменю из трёх режимов с объяснением последствий', () => {
    const menu = buildChipMenu(chipOf(ref('feature', 'localBranch')), CTX);
    const reset = sectionsItem(menu, 'reset');
    expect(reset.children?.map((c) => c.id)).toEqual(['resetSoft', 'resetMixed', 'resetHard']);
    expect(reset.children?.[2].danger, 'hard выбрасывает незакоммиченное').toBe(true);
  });

  it('ремоутная ветка: checkout, worktree, хирургия, удаление на сервере и GitHub', () => {
    const menu = buildChipMenu(chipOf(ref('origin/dev', 'remoteBranch')), CTX);
    const found = ids(menu);
    expect(found).toContain('checkout');
    expect(found).toContain('worktree');
    expect(found).toContain('deleteRemote');
    expect(found).toContain('openGitHub');
    expect(found).not.toContain('rename');

    const remove = flat(menu).find((i) => i.id === 'deleteRemote')!;
    expect(remove.danger).toBe(true);
    expect(
      remove.action?.kind === 'run' &&
        remove.action.operation.kind === 'pushDelete' &&
        remove.action.operation.branch,
      'удаляется ветка на сервере, без префикса remote',
    ).toBe('dev');

    const open = flat(menu).find((i) => i.id === 'openGitHub')!;
    expect(open.action?.kind === 'openUrl' && open.action.url).toBe(
      'https://github.com/pr0ddd/gitspy/tree/dev',
    );
  });

  it('без web-адреса remote нет ни ссылок, ни GitHub', () => {
    const bare: MenuContext = { ...CTX, remotes: [{ name: 'origin', webUrl: null }] };
    const found = ids(buildChipMenu(chipOf(ref('origin/dev', 'remoteBranch')), bare));
    expect(found).not.toContain('openGitHub');
    expect(found).not.toContain('copyLinkCommit');
  });
});

describe('меню коммита', () => {
  it('несёт checkout, worktree, ростки, хирургию, сброс и копии', () => {
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

  it('drop помечен опасным — он переписывает историю', () => {
    expect(flatItem(buildCommitMenu('abc123', CTX), 'drop').danger).toBe(true);
  });

  it('свой заголовок правится только у HEAD-коммита', () => {
    const onHead = buildCommitMenu('headoid', CTX);
    const edit = flatItem(onHead, 'editMessage');
    expect(
      edit.action?.kind === 'ask' &&
        edit.action.ask.kind === 'editMessage' &&
        edit.action.ask.full,
      'старое сообщение подставляется целиком, тело не теряется',
    ).toBe('тема\n\nтело');

    expect(ids(buildCommitMenu('abc123', CTX))).not.toContain('editMessage');
  });

  it('worktree растёт из этого коммита', () => {
    const wt = flatItem(buildCommitMenu('abc123', CTX), 'worktree');
    expect(wt.action?.kind === 'worktree' && wt.action.at).toBe('abc123');
  });
});

const sectionsItem = (sections: ReturnType<typeof buildCommitMenu>, id: string) =>
  sections.flat().find((i) => i.id === id)!;

const flatItem = (sections: ReturnType<typeof buildCommitMenu>, id: string) =>
  flat(sections).find((i) => i.id === id)!;
