import { describe, expect, it } from 'vitest';
import { buildRefTree, filterRefTree, flattenRefTree, type TreeNode } from './refTree';
import type { RefView } from '@/types';

const ref = (name: string): RefView => ({
  name,
  kind: 'localBranch',
  commit: 0,
  oid: 'refoid',
  isHead: false,
  upstream: null,
  ahead: 0,
  behind: 0,
  gone: false,
});

const shape = (nodes: TreeNode[], depth = 0): string[] =>
  nodes.flatMap((node) => [
    `${'  '.repeat(depth)}${node.kind === 'folder' ? `${node.name}/` : node.name}`,
    ...(node.kind === 'folder' ? shape(node.children, depth + 1) : []),
  ]);

describe('buildRefTree', () => {
  it('collapses a chain of folders without a branching point into one row, otherwise the sidebar turns into a staircase', () => {
    const tree = buildRefTree([ref('fixtures/packaging/brunch/dev/minimatch-3.1.5')]);
    expect(shape(tree)).toEqual(['fixtures/packaging/brunch/dev/', '  minimatch-3.1.5']);
  });

  it('stops collapsing at a branching point, where the folder has a choice again', () => {
    const tree = buildRefTree([ref('deps/npm/webpack/dev/a'), ref('deps/npm/brunch/dev/b')]);
    expect(shape(tree)).toEqual(['deps/npm/', '  brunch/dev/', '    b', '  webpack/dev/', '    a']);
  });

  it('keeps folders and leaves in one alphabetical order instead of lifting folders to the top', () => {
    const tree = buildRefTree([ref('develop'), ref('ci/daemon-workflow'), ref('feat/x')]);
    expect(shape(tree)).toEqual(['ci/', '  daemon-workflow', 'develop', 'feat/', '  x']);
  });

  it('gives a leaf the full ref name, because that is what checkout is run on', () => {
    const tree = buildRefTree([ref('pr/36451')]);
    const folder = tree[0];
    expect(folder.kind).toBe('folder');
    if (folder.kind !== 'folder') return;
    expect(folder.children[0].name).toBe('36451');
    expect(folder.children[0].path).toBe('pr/36451');
  });

  it('does not merge a branch with a folder of the same name, and puts the branch first', () => {
    const tree = buildRefTree([ref('feat'), ref('feat/x')]);
    expect(shape(tree)).toEqual(['feat', 'feat/', '  x']);
  });

  it('orders equal names by a rule of its own, not by the stability of the sort', () => {
    const folderFirst = buildRefTree([ref('feat/x'), ref('feat')]);
    const leafFirst = buildRefTree([ref('feat'), ref('feat/x')]);
    expect(shape(folderFirst)).toEqual(shape(leafFirst));
  });

  it('keeps the remote as the first segment of the collapsed folder for a remote branch', () => {
    const tree = buildRefTree([ref('origin/dev/x')]);
    expect(shape(tree)).toEqual(['origin/dev/', '  x']);
  });

  it('gives an empty tree for an empty list, not a root made of nothing', () => {
    expect(buildRefTree([])).toEqual([]);
  });
});

describe('filterRefTree', () => {
  it('keeps only the branches of the tree that hold a match', () => {
    const tree = buildRefTree([ref('ci/daemon-workflow'), ref('feat/login')]);
    expect(shape(filterRefTree(tree, 'daemon'))).toEqual(['ci/', '  daemon-workflow']);
  });

  it('does not leave a folder hanging around once the filter empties it', () => {
    const tree = buildRefTree([ref('ci/one'), ref('ci/two'), ref('feat/x')]);
    expect(shape(filterRefTree(tree, 'two'))).toEqual(['ci/', '  two']);
  });

  it('keeps the contents of a folder whose own name matches', () => {
    const tree = buildRefTree([ref('ci/one'), ref('feat/x')]);
    expect(shape(filterRefTree(tree, 'ci/'))).toEqual(['ci/', '  one']);
  });

  it('returns the tree as is for a blank query', () => {
    const tree = buildRefTree([ref('ci/one')]);
    expect(filterRefTree(tree, '  ')).toBe(tree);
  });

  it('gives nothing when nothing matched, not everything', () => {
    const tree = buildRefTree([ref('ci/one')]);
    expect(filterRefTree(tree, 'nosuchthing')).toEqual([]);
  });
});

describe('flattenRefTree', () => {
  const flat = (names: string[], closed: string[] = []) =>
    flattenRefTree(buildRefTree(names.map(ref)), new Set(closed)).map(
      (row) => `${'  '.repeat(row.depth)}${row.kind === 'folder' ? `${row.name}/` : row.name}`,
    );

  it('flattens a fully open tree into the same rows in the same order', () => {
    expect(flat(['ci/one', 'develop'])).toEqual(['ci/', '  one', 'develop']);
  });

  it('keeps a closed folder as a row but hides its contents, leaving its neighbours alone', () => {
    expect(flat(['ci/one', 'develop'], ['ci'])).toEqual(['ci/', 'develop']);
  });

  it('grows depth by one level at each branching point, not at each name segment', () => {
    const rows = flattenRefTree(buildRefTree([ref('a/b/target'), ref('a/other')]), new Set());
    expect(rows.map((row) => `${row.depth}:${row.name}`)).toEqual([
      '0:a',
      '1:b',
      '2:target',
      '1:other',
    ]);
  });
});
