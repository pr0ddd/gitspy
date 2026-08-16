import { describe, expect, it } from 'vitest';
import { buildFileTree, filesOf, foldersOf, sortedByPath, tallyByLetter } from './fileTree';
import type { StatusEntryView } from '@/shared/api/types';

const entry = (path: string, letter = 'M'): StatusEntryView => ({
  staged: false,
  letter,
  path,
  oldPath: null,
});

const shape = (nodes: ReturnType<typeof buildFileTree>): string[] =>
  nodes.flatMap((node) =>
    node.kind === 'file'
      ? [node.name]
      : [`${node.name}/`, ...shape(node.children).map((s) => `  ${s}`)],
  );

describe('file tree of the working tree', () => {
  it('groups files into folders instead of leaving a flat list', () => {
    const tree = buildFileTree([entry('src/App.tsx'), entry('src/scene.ts'), entry('README.md')]);

    expect(shape(tree)).toEqual(['src/', '  App.tsx', '  scene.ts', 'README.md']);
  });

  it('merges a lone folder into its only child, otherwise the pane turns into a staircase', () => {
    const tree = buildFileTree([entry('crates/gitspy-core/src/state.rs')]);

    expect(shape(tree), 'three folders with no fork between them become a single row').toEqual([
      'crates/gitspy-core/src/',
      '  state.rs',
    ]);
  });

  it('stops merging at a fork: the folder has more than one child again', () => {
    const tree = buildFileTree([entry('crates/core/a.rs'), entry('crates/repo/b.rs')]);

    expect(shape(tree)).toEqual(['crates/', '  core/', '    a.rs', '  repo/', '    b.rs']);
  });

  it('puts folders before files on the same level', () => {
    const tree = buildFileTree([entry('a.txt'), entry('zz/b.txt')]);

    expect(shape(tree)).toEqual(['zz/', '  b.txt', 'a.txt']);
  });

  it('reverses both the folders and the files inside them', () => {
    const tree = buildFileTree([entry('src/a.ts'), entry('src/b.ts'), entry('docs/c.md')], true);

    expect(shape(tree)).toEqual(['src/', '  b.ts', '  a.ts', 'docs/', '  c.md']);
  });

  it('sorts the flat view by the whole path, not by the file name', () => {
    const sorted = sortedByPath([entry('src/z.ts'), entry('docs/a.md')]);

    expect(sorted.map((e) => e.path)).toEqual(['docs/a.md', 'src/z.ts']);
  });

  it('walks the tree back to exactly the files that went in', () => {
    const paths = ['src/App.tsx', 'crates/core/src/lib.rs', 'README.md'];

    expect(
      filesOf(buildFileTree(paths.map((path) => entry(path))))
        .map((e) => e.path)
        .sort(),
    ).toEqual([...paths].sort());
  });

  it('lists folders as whole paths: that is what a collapsed branch of the tree is keyed by', () => {
    const tree = buildFileTree([
      entry('src/app/App.tsx'),
      entry('docs/plan.md'),
      entry('README.md'),
    ]);

    expect(foldersOf(tree)).toEqual(['docs', 'src/app']);
  });

  it('shows what is inside a collapsed folder as status letters with counts', () => {
    const tree = buildFileTree([
      entry('src/a.ts', 'M'),
      entry('src/b.ts', 'M'),
      entry('src/c.ts', '?'),
      entry('src/d.ts', 'D'),
    ]);

    expect(
      tallyByLetter(tree),
      'an untracked file counts as added, and the letters run from added to deleted',
    ).toEqual([
      { letter: 'A', count: 1 },
      { letter: 'M', count: 2 },
      { letter: 'D', count: 1 },
    ]);
  });
});
