import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import * as ipc from '@/shared/api/ipc';

const fake = vi.hoisted(() => {
  const disposable = { dispose: () => {} };
  const revealed: number[] = [];
  const hiddenCalls: Array<{ from: number; to: number }[]> = [];
  const zoneNodes: HTMLElement[] = [];
  const zonesWhileAttaching: boolean[] = [];
  const scrolledTo: number[] = [];
  const events: string[] = [];
  const disposed: string[] = [];
  const modelListeners = new Set<() => void>();
  let attaching = false;
  const sideEditor = () => ({
    updateOptions: () => {},
    revealLineNearTop: (line: number) => {
      revealed.push(line);
    },
    getScrollTop: () => 0,
    setScrollTop: (top: number) => {
      scrolledTo.push(top);
    },
    onDidChangeModel: (listener: () => void) => {
      modelListeners.add(listener);
      return { dispose: () => modelListeners.delete(listener) };
    },
    changeViewZones: (
      callback: (accessor: {
        addZone: (zone: { domNode: HTMLElement }) => string;
        removeZone: (id: string) => void;
      }) => void,
    ) => {
      callback({
        addZone: (zone) => {
          zoneNodes.push(zone.domNode);
          zonesWhileAttaching.push(attaching);
          events.push('zone');
          return 'zone';
        },
        removeZone: () => {},
      });
    },
    onDidScrollChange: () => disposable,
    onDidLayoutChange: () => disposable,
    getLayoutInfo: () => ({ contentWidth: 100 }),
    getScrollLeft: () => 0,
  });
  type FakeModel = { value: string; dispose: () => void };
  type FakeViewModel = {
    model: { original: FakeModel; modified: FakeModel };
    waitForDiff: () => Promise<void>;
    dispose: () => void;
  };
  let attached: FakeViewModel['model'] | null = null;
  let compare: (() => void) | null = null;
  const holding = { compare: false };
  const original = sideEditor();
  const modified = sideEditor();
  const diffEditor = {
    createViewModel: (model: FakeViewModel['model']): FakeViewModel => ({
      model,
      waitForDiff: () =>
        holding.compare
          ? new Promise<void>((resolve) => {
              compare = resolve;
            })
          : Promise.resolve(),
      dispose: () => {
        disposed.push(`vm:${model.modified.value}`);
      },
    }),
    setModel: (next: FakeViewModel | null) => {
      const model = next?.model ?? null;
      if (model === attached) return;
      attaching = true;
      events.push(model ? `attach:${model.modified.value}` : 'detach');
      attached = model;
      modelListeners.forEach((listener) => listener());
      attaching = false;
    },
    getModel: () => attached,
    updateOptions: () => {},
    getOriginalEditor: () => original,
    getModifiedEditor: () => modified,
    getLineChanges: () => [],
    revealFirstDiff: () => {},
    goToDiff: () => {},
    dispose: () => {},
  };
  return {
    diffEditor,
    revealed,
    hiddenCalls,
    zoneNodes,
    zonesWhileAttaching,
    scrolledTo,
    events,
    disposed,
    holding,
    finishCompare: () => compare?.(),
    shownText: () => attached?.modified.value ?? null,
    reset: () => {
      attached = null;
      compare = null;
      holding.compare = false;
      attaching = false;
      modelListeners.clear();
      revealed.length = 0;
      hiddenCalls.length = 0;
      zoneNodes.length = 0;
      zonesWhileAttaching.length = 0;
      scrolledTo.length = 0;
      events.length = 0;
      disposed.length = 0;
    },
  };
});

vi.mock('@/entities/diff', async () => ({
  ...(await vi.importActual<object>('@/entities/diff/diff')),
  ...(await vi.importActual<object>('@/entities/diff/hunks')),
  ...(await vi.importActual<object>('@/entities/diff/attach')),
  ...(await vi.importActual<object>('@/entities/diff/target')),
  DIFF_EDITOR_BASE: {},
  EDITOR_BASE: {},
  languageOf: () => 'plaintext',
  setUpMonaco: () => {},
  userEditorOptions: () => ({}),
  setHiddenLineSpans: (_editor: unknown, spans: { from: number; to: number }[]) => {
    fake.hiddenCalls.push(spans);
    fake.events.push('hidden');
  },
  monaco: {
    editor: {
      createDiffEditor: () => fake.diffEditor,
      create: () => ({
        getModel: () => null,
        getValue: () => '',
        addCommand: () => {},
        dispose: () => {},
      }),
      createModel: (value: string, language: string) => ({
        value,
        language,
        dispose: () => {
          fake.disposed.push(`model:${value}`);
        },
      }),
      ScrollType: { Immediate: 1 },
      ShowLightbulbIconMode: { Off: 'off' },
    },
    KeyMod: { CtrlCmd: 0 },
    KeyCode: { KeyS: 0 },
  },
}));
vi.mock('@/shared/api/ipc', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  diffSides: vi.fn(() => Promise.resolve({ before: '', after: '', binary: false })),
  commitFileHunks: vi.fn(() => Promise.resolve('')),
}));
import '@/shared/config/i18n';
import { TooltipProvider } from '@/shared/ui/tooltip';
import { DiffView } from './DiffView';
import { sameDiffTarget, type DiffTarget } from '@/entities/diff';
import type { ChangedFileView } from '@/shared/api/types';

beforeEach(() => {
  localStorage.clear();
  fake.reset();
});

const fileNamed = (path: string): ChangedFileView => ({
  status: 'M',
  path,
  oldPath: null,
  similarity: null,
  added: 1,
  deleted: 1,
  binary: false,
});

const targetFor = (commit: string, path: string): DiffTarget => ({
  kind: 'commit',
  commit,
  file: fileNamed(path),
});

const view = (target: DiffTarget) => (
  <TooltipProvider>
    <DiffView
      repo="/repo"
      target={target}
      onClose={() => {}}
      onTree={() => {}}
      onRun={() => {}}
      onTarget={() => {}}
      onHistory={() => {}}
    />
  </TooltipProvider>
);

const editorHost = (container: HTMLElement): HTMLElement => {
  const host = container.querySelector<HTMLElement>('div.min-h-0.flex-1:not(.flex-col)');
  if (!host) throw new Error('diff editor container not found');
  return host;
};

const patchAt = (newStart: number) => `@@ -${newStart},2 +${newStart},2 @@\n-a\n+b\n c\n`;

describe('switching files in the diff editor', () => {
  it('assembles the whole view before the swap: scrolls from the patch without waiting for the diff', async () => {
    let releaseSecondSides: (sides: {
      before: string;
      after: string;
      binary: boolean;
    }) => void = () => {};
    vi.mocked(ipc.diffSides).mockImplementation((_repo, commit) =>
      commit === 'aaaa0000'
        ? Promise.resolve({ before: 'old before', after: 'old after', binary: false })
        : new Promise((resolve) => {
            releaseSecondSides = resolve;
          }),
    );
    vi.mocked(ipc.commitFileHunks).mockImplementation((_repo, commit) =>
      Promise.resolve(patchAt(commit === 'aaaa0000' ? 7 : 3)),
    );

    const first = targetFor('aaaa0000', 'src/old.ts');
    const { container, rerender } = render(view(first));
    await act(async () => {});
    expect(fake.shownText(), 'once the data arrives the new text is shown').toBe('old after');
    expect(
      fake.revealed,
      'scrolling to the first hunk comes straight from the patch, not after the diff is recomputed',
    ).toEqual([7]);

    rerender(view(targetFor('bbbb0000', 'src/new.ts')));
    await act(async () => {});
    expect(fake.shownText(), 'the previous content stays in place while the next file loads').toBe(
      'old after',
    );
    expect(
      editorHost(container).className.includes('invisible'),
      'the editor is not hidden while loading',
    ).toBe(false);

    await act(async () =>
      releaseSecondSides({ before: 'new before', after: 'new after', binary: false }),
    );
    expect(fake.shownText(), 'the new file replaced the old one in a single step').toBe(
      'new after',
    );
    expect(fake.revealed, 'the new file is scrolled to its own first hunk').toEqual([7, 3]);
  });

  it('the swap waits for a ready comparison: the old file stays until the new one is aligned', async () => {
    localStorage.setItem('gitspy.diff.mode', '"hunk"');
    vi.mocked(ipc.diffSides).mockImplementation((_repo, commit) =>
      Promise.resolve(
        commit === 'aaaa0000'
          ? { before: 'old before', after: 'old after', binary: false }
          : { before: 'new before', after: 'new after', binary: false },
      ),
    );
    vi.mocked(ipc.commitFileHunks).mockResolvedValue(patchAt(1));

    const { rerender } = render(view(targetFor('aaaa0000', 'src/old.ts')));
    await act(async () => {});
    expect(fake.shownText()).toBe('old after');

    fake.holding.compare = true;
    rerender(view(targetFor('bbbb0000', 'src/new.ts')));
    await act(async () => {});
    expect(
      fake.shownText(),
      'the text has arrived but the diff is still being computed — the previous file stays on screen, with no frame showing an unaligned column',
    ).toBe('old after');
    expect(fake.scrolledTo, 'and the new file has not been scrolled yet').toEqual([0]);

    await act(async () => fake.finishCompare());
    expect(fake.shownText(), 'the diff is computed — the new file appears all at once').toBe(
      'new after',
    );
    expect(fake.scrolledTo, 'and is scrolled to the top right away, in the same pass').toEqual([
      0, 0,
    ]);
  });

  it('previous models and comparisons are disposed after the swap, and ones abandoned midway are disposed on cancel', async () => {
    vi.mocked(ipc.diffSides).mockImplementation((_repo, commit) =>
      Promise.resolve({ before: `${commit} before`, after: `${commit} after`, binary: false }),
    );
    vi.mocked(ipc.commitFileHunks).mockResolvedValue(patchAt(1));

    const { rerender } = render(view(targetFor('aaaa0000', 'src/a.ts')));
    await act(async () => {});
    rerender(view(targetFor('bbbb0000', 'src/b.ts')));
    await act(async () => {});
    expect(
      fake.disposed,
      'after the swap the first file is disposed in full: both models and the comparison',
    ).toEqual(
      expect.arrayContaining([
        'vm:aaaa0000 after',
        'model:aaaa0000 before',
        'model:aaaa0000 after',
      ]),
    );
    expect(
      fake.disposed.filter((entry) => entry.includes('bbbb0000')),
      'the file on screen is still alive',
    ).toEqual([]);

    fake.holding.compare = true;
    rerender(view(targetFor('cccc0000', 'src/c.ts')));
    await act(async () => {});
    rerender(view(targetFor('dddd0000', 'src/d.ts')));
    await act(async () => {});
    expect(
      fake.disposed.filter((entry) => entry.includes('cccc0000')),
      'a file whose comparison was never awaited is disposed on cancel',
    ).toEqual(
      expect.arrayContaining([
        'vm:cccc0000 after',
        'model:cccc0000 before',
        'model:cccc0000 after',
      ]),
    );
  });

  it('in hunk view the lines outside hunks are hidden right away, and the hunk header is already filled in', async () => {
    localStorage.setItem('gitspy.diff.mode', '"hunk"');
    vi.mocked(ipc.diffSides).mockResolvedValue({
      before: Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join('\n'),
      after: Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join('\n'),
      binary: false,
    });
    vi.mocked(ipc.commitFileHunks).mockResolvedValue(patchAt(4));

    const { container } = render(view(targetFor('cccc0000', 'src/some.ts')));
    await act(async () => {});

    expect(
      fake.hiddenCalls.some((spans) => spans.length > 0),
      'the lines outside hunks are hidden in the same pass that swaps the model',
    ).toBe(true);
    expect(fake.zoneNodes.length, 'every hunk gets a zone carrying its header').toBe(1);
    expect(
      fake.zoneNodes[0].textContent ?? '',
      'the hunk header is filled in synchronously, with no empty frame',
    ).toContain('@@ -4,2 +4,2 @@');
    expect(container.querySelector('.min-h-0')).toBeTruthy();
  });

  it('hunk headers are placed while the model is being attached: Monaco aligns the left column in the same pass, and hiding lines comes after', async () => {
    localStorage.setItem('gitspy.diff.mode', '"hunk"');
    vi.mocked(ipc.diffSides).mockResolvedValue({
      before: 'a\nb\nc',
      after: 'a\nx\nc',
      binary: false,
    });
    vi.mocked(ipc.commitFileHunks).mockResolvedValue(patchAt(2));

    render(view(targetFor('cccc0000', 'src/some.ts')));
    await act(async () => {});

    expect(
      fake.zonesWhileAttaching,
      'the zone is added inside setModel — otherwise the left column learns about it on a setTimeout and jumps',
    ).toEqual([true]);
    expect(
      fake.events,
      'order: attach with the zone inside it, then hide lines on both sides — Monaco drops hidden areas when the model is swapped',
    ).toEqual(['attach:a\nx\nc', 'zone', 'hidden', 'hidden']);
  });
});

describe('a binary file', () => {
  it('known from the change list asks git for nothing and shows the note', async () => {
    vi.mocked(ipc.diffSides).mockClear();
    vi.mocked(ipc.commitFileHunks).mockClear();
    const target: DiffTarget = {
      kind: 'commit',
      commit: 'aaaa0000',
      file: { ...fileNamed('model.tar'), binary: true, added: 0, deleted: 0 },
    };
    render(view(target));
    await act(async () => {});

    expect(screen.getByText(/binary file/i)).toBeTruthy();
    expect(ipc.diffSides, 'no blob is read for a file we cannot show').not.toHaveBeenCalled();
    expect(ipc.commitFileHunks).not.toHaveBeenCalled();
  });

  it('found out from the sides is shown as the note too, without an error toast', async () => {
    vi.mocked(ipc.diffSides).mockResolvedValueOnce({ before: '', after: '', binary: true });
    render(view(targetFor('aaaa0000', 'src/blob.bin')));

    await waitFor(() => expect(screen.getByText(/binary file/i)).toBeTruthy());
  });
});

describe('after a binary file', () => {
  it('the next text file shows its diff in the same editor: the host was hidden, never unmounted', async () => {
    const binaryTarget: DiffTarget = {
      kind: 'commit',
      commit: 'aaaa0000',
      file: { ...fileNamed('model.tar'), binary: true, added: 0, deleted: 0 },
    };
    const { container, rerender } = render(view(binaryTarget));
    await act(async () => {});
    const hostWhileBinary = editorHost(container);
    expect(
      hostWhileBinary.classList.contains('hidden'),
      'the editor is hidden under the note',
    ).toBe(true);

    let releaseSides: (sides: {
      before: string;
      after: string;
      binary: boolean;
    }) => void = () => {};
    vi.mocked(ipc.diffSides).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseSides = resolve;
        }),
    );
    rerender(view(targetFor('aaaa0000', 'src/text.ts')));
    await act(async () => {});
    expect(screen.queryByText(/binary file/i)).toBeNull();
    expect(
      hostWhileBinary.classList.contains('hidden'),
      'until the new comparison is ready the editor stays veiled: whatever it still holds is stale',
    ).toBe(true);

    await act(async () => releaseSides({ before: 'a', after: 'b', binary: false }));
    await waitFor(() => expect(hostWhileBinary.classList.contains('hidden')).toBe(false));
    expect(editorHost(container), 'the same host element comes back into view').toBe(
      hostWhileBinary,
    );
  });
});

describe('a repeated click on the same target', () => {
  it('the same target is recognised by its contents, not by reference', () => {
    expect(
      sameDiffTarget(targetFor('aaaa0000', 'src/a.ts'), targetFor('aaaa0000', 'src/a.ts')),
      'two clicks on the same file of a commit give one target — that is what closes the diff',
    ).toBe(true);
    expect(
      sameDiffTarget(targetFor('aaaa0000', 'src/a.ts'), targetFor('bbbb0000', 'src/a.ts')),
    ).toBe(false);
    expect(
      sameDiffTarget(targetFor('aaaa0000', 'src/a.ts'), targetFor('aaaa0000', 'src/b.ts')),
    ).toBe(false);
  });

  it('a working tree file is told apart by path and by staged or unstaged side', () => {
    const tree = (path: string, staged: boolean): DiffTarget => ({
      kind: 'workingTree',
      path,
      status: 'M',
      staged,
    });
    expect(sameDiffTarget(tree('a.ts', false), tree('a.ts', false))).toBe(true);
    expect(
      sameDiffTarget(tree('a.ts', false), tree('a.ts', true)),
      'the staged and unstaged versions of a file are different panes',
    ).toBe(false);
    expect(sameDiffTarget(tree('a.ts', false), targetFor('aaaa0000', 'a.ts'))).toBe(false);
  });
});
