import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, waitFor } from '@testing-library/react';

type FakeDecoration = {
  range: { startLineNumber: number };
  options: {
    className?: string;
    marginClassName?: string;
    glyphMarginClassName?: string;
    linesDecorationsClassName?: string;
    isWholeLine?: boolean;
  };
};

const fake = vi.hoisted(() => {
  type Listener = (event: unknown) => void;
  type Editor = {
    name: string;
    value: string;
    scrollTop: number;
    decorations: FakeDecoration[];
    zones: Array<{ afterLineNumber: number; heightInLines: number }>;
    mouseDown: Listener[];
    mouseMove: Listener[];
    scroll: Listener[];
    revealed: number[];
    disposed: boolean;
  };
  const editors: Editor[] = [];
  const makeEditor = (options: {
    model: { value: string; language: string };
    readOnly: boolean;
  }) => {
    const self: Editor = {
      name: `editor${editors.length}`,
      value: options.model.value,
      scrollTop: 0,
      decorations: [],
      zones: [],
      mouseDown: [],
      mouseMove: [],
      scroll: [],
      revealed: [],
      disposed: false,
    };
    editors.push(self);
    const model = {
      getValue: () => self.value,
      setValue: (next: string) => {
        self.value = next;
      },
      dispose: () => {},
    };
    return {
      getModel: () => model,
      getValue: () => self.value,
      getScrollTop: () => self.scrollTop,
      setScrollTop: (top: number) => {
        self.scrollTop = top;
        self.scroll.forEach((l) => l({ scrollTop: top, scrollTopChanged: true }));
      },
      onDidScrollChange: (l: Listener) => {
        self.scroll.push(l);
        return { dispose: () => {} };
      },
      onMouseDown: (l: Listener) => {
        self.mouseDown.push(l);
        return { dispose: () => {} };
      },
      onMouseMove: (l: Listener) => {
        self.mouseMove.push(l);
        return { dispose: () => {} };
      },
      onMouseLeave: () => ({ dispose: () => {} }),
      createDecorationsCollection: () => ({
        set: (next: FakeDecoration[]) => {
          self.decorations = next;
        },
      }),
      changeViewZones: (
        callback: (accessor: {
          addZone: (zone: { afterLineNumber: number; heightInLines: number }) => string;
          removeZone: (id: string) => void;
        }) => void,
      ) => {
        const kept = self.zones;
        self.zones = [];
        callback({
          addZone: (zone) => {
            self.zones.push({
              afterLineNumber: zone.afterLineNumber,
              heightInLines: zone.heightInLines,
            });
            return `z${self.zones.length}`;
          },
          removeZone: () => {
            kept.length = 0;
          },
        });
      },
      revealLineInCenter: (line: number) => {
        self.revealed.push(line);
      },
      revealLineNearTop: (line: number) => {
        self.revealed.push(line);
      },
      getDomNode: () => document.createElement('div'),
      getOption: () => 20,
      getTopForLineNumber: (line: number) => (line - 1) * 20,
      dispose: () => {
        self.disposed = true;
      },
    };
  };
  return {
    editors,
    makeEditor,
    reset: () => {
      editors.length = 0;
    },
  };
});

vi.mock('@/entities/diff', async () => ({
  ...(await vi.importActual<object>('@/entities/diff/conflictFile')),
  ...(await vi.importActual<object>('@/entities/diff/conflictLayout')),
  ...(await vi.importActual<object>('@/entities/diff/conflict')),
  EDITOR_BASE: {},
  languageOf: () => 'typescript',
  setUpMonaco: () => {},
  userEditorOptions: () => ({}),
  monaco: {
    editor: {
      create: (
        _host: unknown,
        options: { model: { value: string; language: string }; readOnly: boolean },
      ) => fake.makeEditor(options),
      createModel: (value: string, language: string) => ({ value, language }),
      MouseTargetType: { GUTTER_GLYPH_MARGIN: 2, GUTTER_LINE_DECORATIONS: 4 },
      TrackedRangeStickiness: { NeverGrowsWhenTypingAtEdges: 1 },
      EditorOption: { lineHeight: 0 },
    },
    Range: class {
      constructor(
        public startLineNumber: number,
        public startColumn: number,
        public endLineNumber: number,
        public endColumn: number,
      ) {}
    },
  },
}));
vi.mock('@/shared/api/ipc', () => ({
  conflictFile: vi.fn(),
  resolveConflict: vi.fn(),
}));

import '@/shared/config/i18n';
import { TooltipProvider } from '@/shared/ui/tooltip';
import { workStore } from '@/entities/repo';
import { ConflictView } from './ConflictView';
import * as ipc from '@/shared/api/ipc';

const MERGED = [
  'top();',
  '<<<<<<< HEAD',
  'ours();',
  'ours2();',
  '||||||| base',
  'base();',
  '=======',
  'theirs();',
  '>>>>>>> feature',
  'bottom();',
].join('\n');

const file = {
  base: 'top();\nbase();\nbottom();\n',
  ours: 'top();\nours();\nours2();\nbottom();\n',
  theirs: 'top();\ntheirs();\nbottom();\n',
  merged: MERGED,
};

const draw = (onResolved: (tree: unknown) => void = () => {}) =>
  render(
    <TooltipProvider>
      <ConflictView
        repo="/r"
        path="greeting.ts"
        from="feature"
        into="main"
        onClose={() => {}}
        onResolved={onResolved}
      />
    </TooltipProvider>,
  );

const [A, B, OUT] = [0, 1, 2];
const editor = (which: number) => fake.editors[which];
const gutter = (which: number, type: number, line: number) =>
  act(() => {
    editor(which).mouseDown.forEach((l) => l({ target: { type, position: { lineNumber: line } } }));
  });
const settle = () => act(async () => {});

beforeEach(() => {
  fake.reset();
  vi.mocked(ipc.conflictFile).mockResolvedValue(file);
  vi.mocked(ipc.resolveConflict).mockReset();
});

describe('the conflict view on Monaco', () => {
  it('opens three editors: each side as a whole text, the output as what will be saved', async () => {
    draw();
    await waitFor(() => expect(fake.editors.length).toBe(3));

    expect(editor(A).value).toBe('top();\nours();\nours2();\nbottom();');
    expect(editor(B).value).toBe('top();\ntheirs();\nbottom();');
    expect(editor(OUT).value, 'nothing picked yet: the block shows the base version').toBe(
      'top();\nbase();\nbottom();',
    );
  });

  it('tints the conflict lines of a side from the gutter to the text and puts a checkbox beside the block, centred on it', async () => {
    const view = draw();
    await waitFor(() => expect(fake.editors.length).toBe(3));
    await settle();

    const box = view.getByRole('checkbox', { name: /take conflict 1 from a/i });
    expect(box.getAttribute('aria-checked')).toBe('false');
    expect(
      (box as HTMLElement).style.top,
      'lines 2-3 at 20px each: the block spans 20..60, its centre is 40, the 14px box starts at 33',
    ).toBe('33px');
    const lines = editor(A).decorations.filter((d) => d.options.className === 'conflict-line-a');
    expect(lines.map((d) => d.range.startLineNumber)).toEqual([2, 3]);
    expect(
      lines.every(
        (d) => d.options.isWholeLine && d.options.marginClassName === 'conflict-margin-a',
      ),
      'the tint runs from the very left, gutter included, with the bar on the margin only',
    ).toBe(true);
    expect(
      lines.every((d) => d.options.linesDecorationsClassName === undefined),
      'a line nobody took carries no mark until hovered',
    ).toBe(true);
    expect(
      lines.every((d) => d.options.isWholeLine && d.options.className === 'conflict-line-a'),
    ).toBe(true);
  });

  it('a click on the line mark takes that line into the output; a click on the block box takes the whole block', async () => {
    const view = draw();
    await waitFor(() => expect(fake.editors.length).toBe(3));
    await settle();

    await gutter(A, 4, 3);
    expect(editor(OUT).value).toBe('top();\nours2();\nbottom();');
    expect(
      editor(A).decorations.find((d) => d.range.startLineNumber === 3)?.options
        .linesDecorationsClassName,
    ).toBe('gutter-mark-taken');

    const boxB = () => view.getByRole('checkbox', { name: /take conflict 1 from b/i });
    fireEvent.click(boxB());
    expect(editor(OUT).value, 'the block box takes every line of that side').toBe(
      'top();\nours2();\ntheirs();\nbottom();',
    );
    expect(boxB().getAttribute('aria-checked')).toBe('true');

    fireEvent.click(boxB());
    expect(editor(OUT).value, 'the second click on a full box drops the block').toBe(
      'top();\nours2();\nbottom();',
    );
  });

  it('a click on a mark in the output sends the line back', async () => {
    const view = draw();
    await waitFor(() => expect(fake.editors.length).toBe(3));
    await settle();
    fireEvent.click(view.getByRole('checkbox', { name: /take conflict 1 from a/i }));
    expect(editor(OUT).value).toBe('top();\nours();\nours2();\nbottom();');

    await gutter(OUT, 4, 3);
    expect(editor(OUT).value).toBe('top();\nours();\nbottom();');
  });

  it('scrolling one pane scrolls the other two', async () => {
    draw();
    await waitFor(() => expect(fake.editors.length).toBe(3));

    editor(B).scrollTop = 120;
    editor(B).scroll.forEach((l) => l({ scrollTop: 120, scrollTopChanged: true }));

    expect([editor(A).scrollTop, editor(OUT).scrollTop]).toEqual([120, 120]);
  });

  it('the header checkbox of a side takes every conflicting line of that side', async () => {
    const view = draw();
    await waitFor(() => expect(fake.editors.length).toBe(3));
    await settle();

    fireEvent.click(view.getByRole('checkbox', { name: /take every line from b/i }));
    expect(editor(OUT).value).toBe('top();\ntheirs();\nbottom();');
  });

  it('saving sends what the output editor holds — including edits made by hand — and hands the tree back', async () => {
    const tree = { conflicts: 0 };
    vi.mocked(ipc.resolveConflict).mockResolvedValue(tree as never);
    let resolved: unknown = null;
    const view = draw((next) => (resolved = next));
    await waitFor(() => expect(fake.editors.length).toBe(3));
    await settle();
    await gutter(A, 2, 2);
    editor(OUT).value = 'top();\nours();\nours2();\nhand-edited();\nbottom();';

    fireEvent.click(view.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(resolved).toBe(tree));
    expect(vi.mocked(ipc.resolveConflict).mock.calls[0]).toEqual([
      '/r',
      'greeting.ts',
      'top();\nours();\nours2();\nhand-edited();\nbottom();',
    ]);
  });

  it('holds the repository lane while the save is running', async () => {
    workStore.setState({ works: new Map() });
    vi.mocked(ipc.resolveConflict).mockReturnValue(new Promise(() => {}) as never);
    const view = draw();
    await waitFor(() => expect(fake.editors.length).toBe(3));

    fireEvent.click(view.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(workStore.getState().works.get('/r')).toEqual({
        kind: 'resolveConflict',
        target: 'greeting.ts',
      }),
    );
    workStore.setState({ works: new Map() });
  });
});

describe('hovering a conflict line', () => {
  it('offers a plus on a line not taken and a minus on a taken one, in that pane only', async () => {
    draw();
    await waitFor(() => expect(fake.editors.length).toBe(3));
    await settle();

    await act(() => {
      editor(A).mouseMove.forEach((l) => l({ target: { position: { lineNumber: 2 } } }));
    });
    expect(
      editor(A).decorations.find((d) => d.range.startLineNumber === 2)?.options
        .linesDecorationsClassName,
    ).toBe('gutter-mark-add');

    await gutter(A, 4, 2);
    expect(
      editor(A).decorations.find((d) => d.range.startLineNumber === 2)?.options
        .linesDecorationsClassName,
      'once taken, hovering offers to remove',
    ).toBe('gutter-mark-remove');
    expect(
      editor(B).decorations.find((d) => d.range.startLineNumber === 2)?.options
        .linesDecorationsClassName,
      'the other pane is not hovered',
    ).toBeUndefined();
  });
});
