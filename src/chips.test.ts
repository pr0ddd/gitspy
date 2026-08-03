import { describe, expect, it } from 'vitest';
import { chipsFor } from './chips';
import type { RefKind, RefView } from './types';

const ref = (name: string, kind: RefKind, patch: Partial<RefView> = {}): RefView => ({
  name,
  kind,
  commit: 0,
  oid: "refoid",
  isHead: false,
  upstream: null,
  ahead: 0,
  behind: 0,
  gone: false,
  ...patch,
});

const REMOTES = ['origin'];

const shape = (labels: RefView[], remotes = REMOTES) =>
  chipsFor(labels, remotes).map((c) => `${c.isHead ? '✓ ' : ''}${c.name} [${c.marks.join(' ')}]`);

describe('чипы веток', () => {
  it('ветка и её upstream на одном коммите — один чип с двумя значками', () => {
    const local = ref('main', 'localBranch', { upstream: 'origin/main', isHead: true });
    const remote = ref('origin/main', 'remoteBranch');
    expect(shape([local, remote])).toEqual(['✓ main [local remote]']);
  });

  it('ветка без upstream показывает только локальный значок', () => {
    expect(shape([ref('wip', 'localBranch')])).toEqual(['wip [local]']);
  });

  it('удалённая ветка теряет префикс — про сервер говорит аватарка, а не текст', () => {
    expect(shape([ref('origin/dev', 'remoteBranch')])).toEqual(['dev [remote]']);
  });

  it('вложенное имя после префикса сохраняется целиком', () => {
    expect(shape([ref('origin/dev/x', 'remoteBranch')])).toEqual(['dev/x [remote]']);
  });

  it('ветка неизвестного remote показывается как есть, а не режется наугад', () => {
    expect(shape([ref('upstream/dev', 'remoteBranch')])).toEqual(['upstream/dev [remote]']);
  });

  it('разошедшиеся ветки не сливаются, даже стоя рядом в списке', () => {
    const local = ref('main', 'localBranch', { upstream: 'origin/main', ahead: 2 });
    const other = ref('origin/other', 'remoteBranch');
    expect(shape([local, other])).toEqual(['main [local]', 'other [remote]']);
  });

  it('upstream, которого на этом коммите нет, локальную ветку не подделывает', () => {
    const local = ref('main', 'localBranch', { upstream: 'origin/main' });
    expect(shape([local])).toEqual(['main [local]']);
  });

  it('несколько локальных на одном коммите остаются разными чипами', () => {
    const a = ref('main', 'localBranch', { upstream: 'origin/main' });
    const b = ref('spare', 'localBranch');
    const remote = ref('origin/main', 'remoteBranch');
    expect(shape([a, b, remote])).toEqual(['main [local remote]', 'spare [local]']);
  });

  it('теги и стеши значков состояния не получают', () => {
    expect(shape([ref('v1.0', 'tag'), ref('stash@{0}', 'stash')])).toEqual([
      'v1.0 []',
      'stash@{0} []',
    ]);
  });

  it('слитый чип помнит обе ссылки, чтобы по нему можно было действовать', () => {
    const local = ref('main', 'localBranch', { upstream: 'origin/main' });
    const remote = ref('origin/main', 'remoteBranch');
    const [chip] = chipsFor([local, remote], REMOTES);
    expect(chip.refs.map((r) => r.name)).toEqual(['main', 'origin/main']);
    expect(chip.kind).toBe('localBranch');
  });

  it('значок сервера знает, какой это remote, чтобы аватарка была одна на всех', () => {
    const local = ref('main', 'localBranch', { upstream: 'origin/main' });
    const remote = ref('origin/main', 'remoteBranch');
    const [chip] = chipsFor([local, remote], REMOTES);
    expect(chip.remote).toBe('origin');
  });

  it('удалённая ветка без локальной тоже называет свой remote', () => {
    const [chip] = chipsFor([ref('origin/dev/x', 'remoteBranch')], REMOTES);
    expect(chip.remote).toBe('origin');
  });

  it('remote определяется по списку, а не по первому слэшу', () => {
    const remotes = ['origin', 'origin/mirror'];
    const [chip] = chipsFor([ref('origin/mirror/main', 'remoteBranch')], remotes);
    expect(chip.remote).toBe('origin/mirror');
  });

  it('у локальной без upstream аватарки сервера нет вовсе', () => {
    const [chip] = chipsFor([ref('wip', 'localBranch')], REMOTES);
    expect(chip.remote).toBeNull();
  });

  it('порядок ссылок в списке не меняет результат', () => {
    const local = ref('main', 'localBranch', { upstream: 'origin/main' });
    const remote = ref('origin/main', 'remoteBranch');
    expect(shape([remote, local])).toEqual(shape([local, remote]));
  });

  it('текущая ветка встаёт первой, локальные раньше остальных', () => {
    const shaped = shape([
      ref('v1', 'tag'),
      ref('origin/dev', 'remoteBranch'),
      ref('branches', 'localBranch'),
      ref('master', 'localBranch', { isHead: true }),
    ]);
    expect(shaped).toEqual([
      '✓ master [local]',
      'branches [local]',
      'dev [remote]',
      'v1 []',
    ]);
  });
});
