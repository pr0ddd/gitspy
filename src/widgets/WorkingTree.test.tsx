import { beforeEach, describe, expect, it } from 'vitest';

beforeEach(() => localStorage.clear());
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { showNativeMenu } from '@/features/menus';

vi.mock('@/features/menus', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  showNativeMenu: vi.fn(() => Promise.resolve()),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ ask: vi.fn(() => Promise.resolve(false)) }));
vi.mock('@/shared/api/ipc', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  aiGenerateCommit: vi.fn(() =>
    Promise.resolve({ summary: 'Add parser', description: 'Covers fences.' }),
  ),
}));
import '@/shared/config/i18n';
import { TooltipProvider } from '@/shared/ui/tooltip';
import { WorkingTree } from './WorkingTree';
import type { PathOperation, WorkingTreeView } from '@/shared/api/types';
import type { Confirmation } from '@/entities/repo';
import type { Picked } from '@/entities/repo';
import { useKeyboard } from '@/features/keyboard';

const treeWith = (staged: number): WorkingTreeView => ({
  branch: 'branches',
  upstream: null,
  remotes: ['origin'],
  ahead: 0,
  behind: 0,
  staged,
  unstaged: 0,
  conflicts: 0,
  inProgress: null,
  merging: null,
  entries: Array.from({ length: staged }, (_, i) => ({
    staged: true,
    letter: 'M',
    path: `src/file-${i}.ts`,
    oldPath: null,
  })),
});

type Extra = Partial<{
  onConfirm: (confirmation: Confirmation) => void;
  onRun: (operation: PathOperation) => Promise<WorkingTreeView | null> | void;
  description: string;
  amend: boolean;
  onAmend: (next: boolean) => void;
  onMessage: (text: string) => void;
  onDescription: (text: string) => void;
  previous: { subject: string; body: string } | null;
  picked: Picked | null;
  diffOpen: boolean;
  onPick: (picked: Picked | null) => void;
  onOpen: (path: string, status: string, staged: boolean) => void;
}>;

const draw = (tree: WorkingTreeView, message: string, onCommit: () => void, extra: Extra = {}) =>
  render(
    <TooltipProvider>
      <WorkingTree
        repo="/repo"
        tree={tree}
        message={message}
        description={extra.description ?? ''}
        amend={extra.amend ?? false}
        previous={extra.previous ?? null}
        picked={extra.picked ?? null}
        diffOpen={extra.diffOpen ?? false}
        onPick={extra.onPick ?? (() => {})}
        onMessage={extra.onMessage ?? (() => {})}
        onDescription={extra.onDescription ?? (() => {})}
        onAmend={extra.onAmend ?? (() => {})}
        onCommit={onCommit}
        onRun={(operation) => Promise.resolve(extra.onRun?.(operation) ?? null)}
        onOperation={() => {}}
        onConfirm={extra.onConfirm ?? (() => {})}
        onOpen={extra.onOpen ?? (() => {})}
        onCopy={() => {}}
        onHistory={() => {}}
      />
    </TooltipProvider>,
  );

describe('the generate message button', () => {
  it('stays disabled while nothing is staged', () => {
    localStorage.setItem('gitspy.ai.model', '"qwen2.5-coder"');
    draw(treeWith(0), '', () => {});
    const generate = screen.getByLabelText('Generate commit message') as HTMLButtonElement;
    expect(generate.disabled, 'nothing to describe means nothing to generate').toBe(true);
  });

  it('stays disabled while no model is chosen', () => {
    draw(treeWith(1), '', () => {});
    const generate = screen.getByLabelText('Generate commit message') as HTMLButtonElement;
    expect(
      generate.disabled,
      'without a configured model there is nowhere to send the request',
    ).toBe(true);
  });

  it('fills both fields of the draft from the answer of the model', async () => {
    localStorage.setItem('gitspy.ai.model', '"qwen2.5-coder"');
    const onMessage = vi.fn();
    const onDescription = vi.fn();
    draw(treeWith(1), '', () => {}, { onMessage, onDescription });

    fireEvent.click(screen.getByLabelText('Generate commit message'));

    await vi.waitFor(() =>
      expect(onMessage, 'the subject comes from the answer of the model').toHaveBeenCalledWith(
        'Add parser',
      ),
    );
    expect(onDescription, 'the description comes with the same answer').toHaveBeenCalledWith(
      'Covers fences.',
    );
  });
});

describe('the header of the working tree panel', () => {
  it('the trash button does not discard the changes itself, it asks for confirmation', () => {
    const asked: Confirmation[] = [];
    let ranStraightAway = 0;
    const { getByRole } = draw(treeWith(2), '', () => {}, {
      onConfirm: (confirmation) => asked.push(confirmation),
      onRun: () => {
        ranStraightAway += 1;
      },
    });

    fireEvent.click(getByRole('button', { name: /discard all changes/i }));

    expect(asked, 'pressing the trash button hands the operation over for confirmation').toEqual([
      { kind: 'operation', operation: { kind: 'discardAll' } },
    ]);
    expect(ranStraightAway, 'nothing runs until it is confirmed').toBe(0);
  });

  it('counts all the changes and names the branch they sit on', () => {
    const { getByText } = draw(treeWith(3), '', () => {});

    expect(getByText('3 file changes on')).toBeTruthy();
    expect(getByText('branches')).toBeTruthy();
  });

  it('counts a single change in the singular', () => {
    const { getByText } = draw(treeWith(1), '', () => {});

    expect(getByText('1 file change on')).toBeTruthy();
  });

  it('the tree view gathers the files under their directory and keeps it collapsed until it is opened', () => {
    const { getByRole, queryByText } = draw(treeWith(2), '', () => {});

    expect(queryByText('src'), 'in the flat view a directory gets no row of its own').toBeNull();

    fireEvent.click(getByRole('radio', { name: /tree/i }));

    expect(queryByText('src'), 'in the tree view the directory becomes a row').toBeTruthy();
    expect(
      queryByText('file-0.ts'),
      'a collapsed directory does not spill its content: a hundred files must not unfold by themselves',
    ).toBeNull();

    fireEvent.click(getByRole('button', { name: /expand all/i }));

    expect(
      queryByText('file-0.ts'),
      'an expanded directory shows the file without the path in its name',
    ).toBeTruthy();
  });

  it('a click on a directory expands it and collapses it again', () => {
    const { getByRole, getByText, queryByText } = draw(treeWith(2), '', () => {});

    fireEvent.click(getByRole('radio', { name: /tree/i }));
    fireEvent.click(getByText('src'));

    expect(queryByText('file-0.ts'), 'the first click expands').toBeTruthy();

    fireEvent.click(getByText('src'));

    expect(queryByText('file-0.ts'), 'the second one collapses').toBeNull();
  });
});

describe('the context menu of a file', () => {
  it('a right click on a row opens a menu with the file actions', () => {
    vi.mocked(showNativeMenu).mockClear();
    draw(treeWith(2), '', () => {});

    fireEvent.contextMenu(screen.getByText('file-0.ts'));

    expect(showNativeMenu).toHaveBeenCalledTimes(1);
    const [sections] = vi.mocked(showNativeMenu).mock.calls[0];
    expect(sections.flat().map((item) => item.id)).toContain('unstage');
    expect(sections.flat().map((item) => item.id)).toContain('ignore');
  });
});

describe('committing from the working tree panel', () => {
  it('keeps the button dead while the message is empty', () => {
    const { getByRole } = draw(treeWith(2), '   ', () => {});
    expect((getByRole('button', { name: /^commit$/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('creates a commit on click when there is a message and something staged', () => {
    let committed = 0;
    const { getByRole } = draw(treeWith(2), 'fix: thing', () => (committed += 1));
    const button = getByRole('button', { name: /^commit$/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(committed).toBe(1);
  });

  it('has nothing to commit without a single file in the index', () => {
    const { getByRole } = draw(treeWith(0), 'fix: thing', () => {});
    expect((getByRole('button', { name: /^commit$/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('Cmd+Enter in the message field commits the same way the button does', () => {
    let committed = 0;
    const { getByPlaceholderText } = draw(treeWith(1), 'fix', () => (committed += 1));
    fireEvent.keyDown(getByPlaceholderText(/commit message/i), { key: 'Enter', metaKey: true });
    expect(committed).toBe(1);
  });

  it('the description is typed in its own field and is handed outwards', () => {
    let described = '';
    const { getByPlaceholderText } = draw(treeWith(1), 'fix', () => {}, {
      onDescription: (text) => (described = text),
    });
    fireEvent.change(getByPlaceholderText(/description/i), { target: { value: 'why it is so' } });
    expect(described).toBe('why it is so');
  });

  it('amend brings the button back to life even with an empty index', () => {
    const { getByRole } = draw(treeWith(0), 'better words', () => {}, {
      amend: true,
      previous: { subject: 'old', body: '' },
    });
    expect(
      (getByRole('button', { name: /^commit$/i }) as HTMLButtonElement).disabled,
      'amend rewrites the message of the previous commit, the index is allowed to be empty',
    ).toBe(false);
  });

  it('turning amend on with empty fields fills in the previous message', () => {
    let message = '';
    let description = '';
    const { getByRole } = draw(treeWith(0), '', () => {}, {
      previous: { subject: 'old subject', body: 'old body' },
      onMessage: (text) => (message = text),
      onDescription: (text) => (description = text),
    });
    fireEvent.click(getByRole('checkbox', { name: 'Amend previous commit' }));
    expect(message, 'the subject of the previous commit moved into the field').toBe('old subject');
    expect(description, 'the body of the previous commit moved into the description').toBe(
      'old body',
    );
  });

  it('amend is unavailable without a previous commit', () => {
    const { getByRole } = draw(treeWith(1), 'fix', () => {}, { previous: null });
    expect(
      (getByRole('checkbox', { name: 'Amend previous commit' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe('the panel during a merge', () => {
  const mergingTree = (conflicts: number, resolved: number): WorkingTreeView => ({
    ...treeWith(0),
    branch: 'main',
    conflicts,
    inProgress: 'merge',
    merging: { from: 'feature', subject: "Merge branch 'feature'" },
    unstaged: conflicts,
    staged: resolved,
    entries: [
      ...Array.from({ length: conflicts }, (_, i) => ({
        staged: false,
        letter: 'U',
        path: `clash-${i}.ts`,
        oldPath: null,
      })),
      ...Array.from({ length: resolved }, (_, i) => ({
        staged: true,
        letter: 'M',
        path: `done-${i}.ts`,
        oldPath: null,
      })),
    ],
  });

  const drawMerging = (
    tree: WorkingTreeView,
    over: {
      message?: string;
      onCommit?: () => void;
      onRun?: (operation: unknown) => void;
      onOperation?: (operation: { kind: string }) => void;
    } = {},
  ) =>
    render(
      <TooltipProvider>
        <WorkingTree
          repo="/repo"
          tree={tree}
          message={over.message ?? ''}
          description=""
          amend={false}
          previous={null}
          picked={null}
          diffOpen={false}
          onPick={() => {}}
          onMessage={() => {}}
          onDescription={() => {}}
          onAmend={() => {}}
          onCommit={over.onCommit ?? (() => {})}
          onRun={(operation) => Promise.resolve(over.onRun?.(operation) ?? null)}
          onOperation={(operation) => over.onOperation?.(operation)}
          onConfirm={() => {}}
          onOpen={() => {}}
          onCopy={() => {}}
          onHistory={() => {}}
        />
      </TooltipProvider>,
    );

  it('names the sections conflicted and resolved, and the header names both branches', () => {
    const { getByText } = drawMerging(mergingTree(2, 1));
    expect(getByText(/conflicted files/i)).toBeTruthy();
    expect(getByText(/resolved files/i)).toBeTruthy();
    expect(getByText('feature')).toBeTruthy();
    expect(getByText('main', { exact: true })).toBeTruthy();
  });

  it('mark all resolved stages every conflicted path at once', () => {
    let ran: { kind: string; paths?: string[] } | null = null;
    const { getByRole } = drawMerging(mergingTree(2, 0), {
      onRun: (operation) => (ran = operation as { kind: string; paths?: string[] }),
    });
    fireEvent.click(getByRole('button', { name: /mark all resolved/i }));
    expect(ran, 'marking resolved is git add, the button means nothing else').toEqual({
      kind: 'stage',
      paths: ['clash-0.ts', 'clash-1.ts'],
    });
  });

  it('commit and merge is dead while conflicts remain and alive once they are gone', () => {
    const dead = drawMerging(mergingTree(2, 0), { message: 'Merge!' });
    expect(
      (dead.getByRole('button', { name: /commit and merge/i }) as HTMLButtonElement).disabled,
      'git commit fails while conflicts are unresolved — the button knows it beforehand',
    ).toBe(true);
    dead.unmount();

    let committed = 0;
    const alive = drawMerging(mergingTree(0, 2), {
      message: 'Merge!',
      onCommit: () => (committed += 1),
    });
    fireEvent.click(alive.getByRole('button', { name: /commit and merge/i }));
    expect(committed).toBe(1);
  });

  it('a merge without conflicts is the ordinary staging panel with a pair of buttons below', () => {
    const view = drawMerging(mergingTree(0, 2), { message: 'Merge!' });
    expect(
      view.getByText(/unstaged/i),
      'the sections are the ordinary ones, as outside a merge',
    ).toBeTruthy();
    expect(view.getByText(/^staged/i)).toBeTruthy();
    expect(
      view.queryByText(/conflicted files/i),
      'no conflicts means no conflict panel',
    ).toBeNull();
    expect(view.queryByText(/resolved files/i)).toBeNull();
    expect(view.getByRole('button', { name: /commit and merge/i })).toBeTruthy();
    expect(view.getByRole('button', { name: /abort merge/i })).toBeTruthy();
    expect(
      (view.getByRole('checkbox', { name: 'Amend previous commit' }) as HTMLButtonElement).disabled,
      'amending in the middle of a merge is not allowed, so the box is there but off',
    ).toBe(true);
    expect(view.getByRole('checkbox', { name: 'Push after commit' })).toBeTruthy();
  });

  it('unstaging a resolved file brings the conflict back instead of a bare reset', () => {
    let ran: { kind: string; paths?: string[] } | null = null;
    const { getByRole } = drawMerging(mergingTree(1, 1), {
      onRun: (operation) => (ran = operation as { kind: string; paths?: string[] }),
    });
    fireEvent.click(getByRole('button', { name: /^unresolve$/i }));
    expect(ran, 'git reset wipes the merge stages for good, checkout -m brings them back').toEqual({
      kind: 'unresolve',
      paths: ['done-0.ts'],
    });
  });

  it('abort merge calls an operation from the closed list', () => {
    let ran: string | null = null;
    const { getByRole } = drawMerging(mergingTree(2, 0), {
      onOperation: (operation) => (ran = operation.kind),
    });
    fireEvent.click(getByRole('button', { name: /abort merge/i }));
    expect(ran).toBe('mergeAbort');
  });

  it('amending in the middle of a merge is not allowed, so the checkbox is disabled', () => {
    const { getByRole } = drawMerging(mergingTree(1, 0));
    expect(
      (getByRole('checkbox', { name: 'Amend previous commit' }) as HTMLButtonElement).disabled,
      'git commit --amend refuses while MERGE_HEAD is there',
    ).toBe(true);
    expect(getByRole('checkbox', { name: 'Push after commit' })).toBeTruthy();
  });
});

const unstagedTree = (paths: string[]): WorkingTreeView => ({
  ...treeWith(0),
  unstaged: paths.length,
  entries: paths.map((path) => ({ staged: false, letter: 'M', path, oldPath: null })),
});

const gitThatMoves =
  (tree: WorkingTreeView) =>
  (operation: PathOperation): Promise<WorkingTreeView | null> => {
    if (!('paths' in operation)) return Promise.resolve(tree);
    const staged = operation.kind === 'stage';
    return Promise.resolve({
      ...tree,
      entries: tree.entries.map((entry) =>
        operation.paths.includes(entry.path) ? { ...entry, staged } : entry,
      ),
    });
  };

function Keyboard({ children }: { children: React.ReactNode }) {
  useKeyboard('files');
  return <>{children}</>;
}

const drawWithKeys = (tree: WorkingTreeView, extra: Extra = {}) =>
  render(
    <TooltipProvider>
      <Keyboard>
        <WorkingTree
          repo="/repo"
          tree={tree}
          message=""
          description=""
          amend={false}
          previous={null}
          picked={extra.picked ?? null}
          diffOpen={extra.diffOpen ?? false}
          onPick={extra.onPick ?? (() => {})}
          onMessage={() => {}}
          onDescription={() => {}}
          onAmend={() => {}}
          onCommit={() => {}}
          onRun={(operation) => Promise.resolve(extra.onRun?.(operation) ?? null)}
          onOperation={() => {}}
          onConfirm={() => {}}
          onOpen={extra.onOpen ?? (() => {})}
          onCopy={() => {}}
          onHistory={() => {}}
        />
      </Keyboard>
    </TooltipProvider>,
  );

const press = (key: string) => fireEvent.keyDown(window, { key });

describe('the picked file', () => {
  it('is highlighted, not merely outlined on hover', () => {
    drawWithKeys(unstagedTree(['a.ts', 'b.ts']), { picked: { path: 'b.ts', staged: false } });

    const rows = screen.getAllByRole('option');
    expect(
      rows.map((row) => row.getAttribute('aria-selected')),
      'exactly one file is picked',
    ).toEqual(['false', 'true']);
  });

  it('the down arrow moves to the next file', () => {
    const onPick = vi.fn();
    drawWithKeys(unstagedTree(['a.ts', 'b.ts', 'c.ts']), {
      picked: { path: 'a.ts', staged: false },
      onPick,
    });

    press('ArrowDown');
    expect(onPick, 'down means the next one down the list').toHaveBeenLastCalledWith({
      path: 'b.ts',
      staged: false,
    });
  });

  it('the down arrow goes from the last file to the first one', () => {
    const onPick = vi.fn();
    drawWithKeys(unstagedTree(['a.ts', 'b.ts']), {
      picked: { path: 'b.ts', staged: false },
      onPick,
    });

    press('ArrowDown');
    expect(
      onPick,
      'the list wraps around instead of stopping at the edge',
    ).toHaveBeenLastCalledWith({
      path: 'a.ts',
      staged: false,
    });
  });

  it('the S key stages the picked file, and the pick moves only after git answers', async () => {
    const tree = unstagedTree(['a.ts', 'b.ts', 'c.ts']);
    const onRun = vi.fn(gitThatMoves(tree));
    const onPick = vi.fn();
    drawWithKeys(tree, { picked: { path: 'b.ts', staged: false }, onRun, onPick });

    press('s');

    expect(onRun, 'it is exactly the picked file that gets staged').toHaveBeenCalledWith({
      kind: 'stage',
      paths: ['b.ts'],
    });
    expect(
      onPick,
      'the pick is left alone until git answers — otherwise the row blinks twice',
    ).not.toHaveBeenCalled();

    await vi.waitFor(() =>
      expect(
        onPick,
        'once the answer is in, the pick moves to the next file of the section: S is pressed in a row',
      ).toHaveBeenLastCalledWith({
        path: 'c.ts',
        staged: false,
      }),
    );
  });

  it('opens the next file as well while the diff is open', async () => {
    const tree = unstagedTree(['a.ts', 'b.ts', 'c.ts']);
    const onOpen = vi.fn();
    drawWithKeys(tree, {
      picked: { path: 'b.ts', staged: false },
      diffOpen: true,
      onRun: gitThatMoves(tree),
      onOpen,
    });

    press('s');

    await vi.waitFor(() =>
      expect(onOpen, 'the diff already shows the next file').toHaveBeenLastCalledWith(
        'c.ts',
        'M',
        false,
      ),
    );
  });

  it('the last file of a section catches up with itself in the neighbouring one: the pick does not vanish', async () => {
    const tree = unstagedTree(['a.ts']);
    const onPick = vi.fn();
    drawWithKeys(tree, {
      picked: { path: 'a.ts', staged: false },
      onRun: gitThatMoves(tree),
      onPick,
    });

    press('s');

    await vi.waitFor(() => expect(onPick).toHaveBeenLastCalledWith({ path: 'a.ts', staged: true }));
  });

  it('leaves the pick where it was when git answers with an error', async () => {
    const onPick = vi.fn();
    drawWithKeys(unstagedTree(['a.ts', 'b.ts']), {
      picked: { path: 'a.ts', staged: false },
      onRun: () => Promise.resolve(null),
      onPick,
    });

    press('s');
    await Promise.resolve();

    expect(onPick, 'no fresh tree means nothing to move the pick over').not.toHaveBeenCalled();
  });

  it('the Stage button in a row behaves exactly like the key', async () => {
    const tree = unstagedTree(['a.ts', 'b.ts']);
    const onPick = vi.fn();
    drawWithKeys(tree, {
      picked: { path: 'a.ts', staged: false },
      onRun: gitThatMoves(tree),
      onPick,
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Stage file' })[0]);

    await vi.waitFor(() =>
      expect(onPick, 'mouse and keyboard move the pick the same way').toHaveBeenLastCalledWith({
        path: 'b.ts',
        staged: false,
      }),
    );
  });

  it('the arrow does not open the diff by itself while the diff is closed', () => {
    const onOpen = vi.fn();
    drawWithKeys(unstagedTree(['a.ts', 'b.ts']), {
      picked: { path: 'a.ts', staged: false },
      onOpen,
    });

    press('ArrowDown');
    expect(
      onOpen,
      'otherwise arrowing through the list would jerk the main view',
    ).not.toHaveBeenCalled();
  });

  it('the arrow leads the diff along while the diff is open', () => {
    const onOpen = vi.fn();
    drawWithKeys(unstagedTree(['a.ts', 'b.ts']), {
      picked: { path: 'a.ts', staged: false },
      diffOpen: true,
      onOpen,
    });

    press('ArrowDown');
    expect(onOpen, 'the diff follows the pick').toHaveBeenCalledWith('b.ts', 'M', false);
  });
});

describe('S pressed in a row', () => {
  it('stages three files in three presses: pick and tree go round through the answer of git', async () => {
    let tree = unstagedTree(['a.ts', 'b.ts', 'c.ts', 'd.ts']);
    let picked: Picked | null = { path: 'a.ts', staged: false };
    const staged: string[] = [];

    function Harness() {
      const [shownTree, setShownTree] = useState(tree);
      const [shownPick, setShownPick] = useState<Picked | null>(picked);
      return (
        <TooltipProvider>
          <Keyboard>
            <WorkingTree
              repo="/repo"
              tree={shownTree}
              message=""
              description=""
              amend={false}
              previous={null}
              picked={shownPick}
              diffOpen={false}
              onPick={(next) => {
                picked = next;
                setShownPick(next);
              }}
              onMessage={() => {}}
              onDescription={() => {}}
              onAmend={() => {}}
              onCommit={() => {}}
              onRun={(operation) => {
                if ('paths' in operation) staged.push(...operation.paths);
                return gitThatMoves(tree)(operation).then((fresh) => {
                  if (fresh) {
                    tree = fresh;
                    setShownTree(fresh);
                  }
                  return fresh;
                });
              }}
              onOperation={() => {}}
              onConfirm={() => {}}
              onOpen={() => {}}
              onCopy={() => {}}
              onHistory={() => {}}
            />
          </Keyboard>
        </TooltipProvider>
      );
    }
    render(<Harness />);

    press('s');
    await vi.waitFor(() => expect(picked).toEqual({ path: 'b.ts', staged: false }));
    press('s');
    await vi.waitFor(() => expect(picked).toEqual({ path: 'c.ts', staged: false }));
    press('s');
    await vi.waitFor(() => expect(picked).toEqual({ path: 'd.ts', staged: false }));

    expect(staged, 'every press stages exactly the file that is picked').toEqual([
      'a.ts',
      'b.ts',
      'c.ts',
    ]);
  });
});
