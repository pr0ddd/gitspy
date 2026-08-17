import { describe, expect, it } from 'vitest';
import { chipsFor } from './chips';
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

const REMOTES = ['origin'];

const shape = (labels: RefView[], remotes = REMOTES) =>
  chipsFor(labels, remotes).map((c) => `${c.isHead ? '✓ ' : ''}${c.name} [${c.marks.join(' ')}]`);

describe('branch chips', () => {
  it('merges a branch and its upstream on the same commit into one chip with two marks', () => {
    const local = ref('main', 'localBranch', { upstream: 'origin/main', isHead: true });
    const remote = ref('origin/main', 'remoteBranch');
    expect(shape([local, remote])).toEqual(['✓ main [local remote]']);
  });

  it('shows only the local mark for a branch without an upstream', () => {
    expect(shape([ref('wip', 'localBranch')])).toEqual(['wip [local]']);
  });

  it('folds a same-named remote branch on the same commit into the local chip even without an upstream', () => {
    const local = ref('master', 'localBranch', { isHead: true });
    const remote = ref('origin/master', 'remoteBranch');
    expect(
      shape([local, remote]),
      'a clone whose tracking config is gone still has one master, not two',
    ).toEqual(['✓ master [local remote]']);
  });

  it('drops the remote prefix from a remote branch: the avatar names the host, not the text', () => {
    expect(shape([ref('origin/dev', 'remoteBranch')])).toEqual(['dev [remote]']);
  });

  it('keeps the whole nested name that follows the remote prefix', () => {
    expect(shape([ref('origin/dev/x', 'remoteBranch')])).toEqual(['dev/x [remote]']);
  });

  it('shows a branch of an unknown remote as is instead of cutting it at a guess', () => {
    expect(shape([ref('upstream/dev', 'remoteBranch')])).toEqual(['upstream/dev [remote]']);
  });

  it('does not merge diverged branches even when they sit next to each other in the list', () => {
    const local = ref('main', 'localBranch', { upstream: 'origin/main', ahead: 2 });
    const other = ref('origin/other', 'remoteBranch');
    expect(shape([local, other])).toEqual(['main [local]', 'other [remote]']);
  });

  it('an upstream that is not on this commit does not fake a remote mark on the local branch', () => {
    const local = ref('main', 'localBranch', { upstream: 'origin/main' });
    expect(shape([local])).toEqual(['main [local]']);
  });

  it('keeps several local branches on one commit as separate chips', () => {
    const a = ref('main', 'localBranch', { upstream: 'origin/main' });
    const b = ref('spare', 'localBranch');
    const remote = ref('origin/main', 'remoteBranch');
    expect(shape([a, b, remote])).toEqual(['main [local remote]', 'spare [local]']);
  });

  it('gives a tag the tag mark and a stash no chip at all', () => {
    expect(
      shape([ref('v1.0', 'tag'), ref('stash@{0}', 'stash')]),
      'a stash is already drawn as a square node in the graph, so a chip would say the same thing twice',
    ).toEqual(['v1.0 [tag]']);
  });

  it('a merged chip remembers both refs so actions can be run on it', () => {
    const local = ref('main', 'localBranch', { upstream: 'origin/main' });
    const remote = ref('origin/main', 'remoteBranch');
    const [chip] = chipsFor([local, remote], REMOTES);
    expect(chip.refs.map((r) => r.name)).toEqual(['main', 'origin/main']);
    expect(chip.kind).toBe('localBranch');
  });

  it('names the remote on the chip so one avatar serves every ref of that remote', () => {
    const local = ref('main', 'localBranch', { upstream: 'origin/main' });
    const remote = ref('origin/main', 'remoteBranch');
    const [chip] = chipsFor([local, remote], REMOTES);
    expect(chip.remote).toBe('origin');
  });

  it('a remote branch without a local one still names its remote', () => {
    const [chip] = chipsFor([ref('origin/dev/x', 'remoteBranch')], REMOTES);
    expect(chip.remote).toBe('origin');
  });

  it('resolves the remote against the list of remotes, not at the first slash', () => {
    const remotes = ['origin', 'origin/mirror'];
    const [chip] = chipsFor([ref('origin/mirror/main', 'remoteBranch')], remotes);
    expect(chip.remote).toBe('origin/mirror');
  });

  it('a local branch without an upstream has no host avatar at all', () => {
    const [chip] = chipsFor([ref('wip', 'localBranch')], REMOTES);
    expect(chip.remote).toBeNull();
  });

  it('the order of the refs in the list does not change the result', () => {
    const local = ref('main', 'localBranch', { upstream: 'origin/main' });
    const remote = ref('origin/main', 'remoteBranch');
    expect(shape([remote, local])).toEqual(shape([local, remote]));
  });

  it('puts the current branch first and the local branches ahead of the rest', () => {
    const shaped = shape([
      ref('v1', 'tag'),
      ref('origin/dev', 'remoteBranch'),
      ref('branches', 'localBranch'),
      ref('master', 'localBranch', { isHead: true }),
    ]);
    expect(shaped).toEqual(['✓ master [local]', 'branches [local]', 'dev [remote]', 'v1 [tag]']);
  });
});
