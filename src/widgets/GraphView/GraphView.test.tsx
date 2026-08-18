import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Profiler, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { GraphView } from './index';
import { showNativeMenu } from '@/features/menus';

vi.mock('@/features/menus', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  showNativeMenu: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(showNativeMenu).mockClear();
});
import { CHUNK, graphGeometry, layoutColumns, listWidth, RowCache, rowTop } from '@/entities/graph';
import { METRICS_AVATARS } from '@/entities/graph';
import '@/shared/config/i18n';
import { newSession, type Session } from '@/entities/repo';
import { TooltipProvider } from '@/shared/ui/tooltip';
import type { RefView, RepoView, RowView, WindowView } from '@/shared/api/types';

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.getBoundingClientRect = () =>
    ({
      width: 800,
      height: 600,
      top: 0,
      left: 0,
      right: 800,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
});

const repo = (count: number): RepoView => ({
  path: '/repo',
  count,
  maxLane: 4,
  head: 0,
  truncated: false,
  readMs: 1,
  layoutMs: 1,
  minimap: [],
  minimapColours: [],
  remotes: [],
  refs: [],
});

const row = (index: number): RowView => ({
  kind: 'commit',
  index,
  lane: 0,
  colour: 0,
  node: 0,
  hash: `h${index}`,
  author: 'pr0d',
  email: 'p@example.com',
  time: 0,
  committer: 'pr0d',
  committerEmail: 'p@example.com',
  committerTime: 0,
  subject: 's',
  body: '',
});

const window = (): WindowView => ({
  start: 0,
  rows: Array.from({ length: CHUNK }, (_, i) => row(i)),
  segOffsets: Array.from({ length: CHUNK + 1 }, () => 0),
  segKind: [],
  segFrom: [],
  segTo: [],
  segColour: [],
});

const sessionWith = (count: number): Session => ({
  ...newSession('/repo'),
  repo: repo(count),
  loading: false,
});

const workingTreeFirst = (): WindowView => {
  const filled = window();
  return {
    ...filled,
    rows: [
      {
        kind: 'workingTree',
        index: 0,
        lane: 0,
        colour: 0,
        node: 0,
        added: 0,
        modified: 1,
        deleted: 0,
        conflicts: 0,
        inProgress: null,
      },
      ...filled.rows.slice(1),
    ],
  };
};

const settleFrames = () =>
  act(
    () =>
      new Promise<void>((done) => {
        requestAnimationFrame(() => requestAnimationFrame(() => done()));
      }),
  );

describe('re-rendering the app shell', () => {
  const stillProps = {
    avatars: null,
    redraw: 0,
    metrics: METRICS_AVATARS,
    pullHeads: new Set<string>(),
    currentBranch: null,
    onSelect: () => {},
    onCheckoutRef: () => {},
    onRun: () => {},
    onConfirm: () => {},
    onCopy: () => {},
    onAsk: () => {},
    onWorktree: () => {},
    onOpenUrl: () => {},
    onNeed: () => {},
    message: '',
    onMessage: () => {},
    onCommit: () => {},
    compact: false,
    onCompact: () => {},
  };

  it('toggling the sidebar — a render of the parent — does not redraw the graph', () => {
    const rows = new RowCache();
    rows.put(0, window());
    const session = sessionWith(CHUNK);
    const reads = vi.spyOn(rows, 'row');
    let flip: () => void = () => {};

    function Frame() {
      const [, setOpen] = useState(false);
      flip = () => setOpen((now) => !now);
      return <GraphView session={session} rows={rows} {...stillProps} />;
    }

    render(<Frame />);
    const afterMount = reads.mock.calls.length;

    act(() => flip());

    expect(reads.mock.calls.length, 'the graph body does not run when the shell re-renders').toBe(
      afterMount,
    );
  });
});

describe('scrolling the graph', () => {
  it('does not cause a single React render', () => {
    const rows = new RowCache();
    rows.put(0, window());

    let commits = 0;
    const { container } = render(
      <Profiler id="graph" onRender={() => (commits += 1)}>
        <GraphView
          session={sessionWith(CHUNK)}
          avatars={null}
          rows={rows}
          redraw={0}
          metrics={METRICS_AVATARS}
          pullHeads={new Set<string>()}
          currentBranch={null}
          onSelect={() => {}}
          onCheckoutRef={() => {}}
          onRun={() => {}}
          onConfirm={() => {}}
          onCopy={() => {}}
          onAsk={() => {}}
          onWorktree={() => {}}
          onOpenUrl={() => {}}
          onNeed={() => {}}
          message=""
          onMessage={() => {}}
          onCommit={() => {}}
          compact={false}
          onCompact={() => {}}
        />
      </Profiler>,
    );
    const host = container.querySelector('.relative') as HTMLElement;
    expect(host).toBeTruthy();

    const afterMount = commits;
    act(() => {
      for (let i = 0; i < 30; i++) {
        host.dispatchEvent(
          new WheelEvent('wheel', {
            deltaY: 120,
            bubbles: true,
            cancelable: true,
          }),
        );
      }
    });

    expect(commits).toBe(afterMount);
  });

  it('asks for the missing chunks without blocking the drawing', () => {
    const rows = new RowCache();
    const asked: number[][] = [];

    render(
      <GraphView
        session={sessionWith(CHUNK * 8)}
        avatars={null}
        rows={rows}
        redraw={0}
        metrics={METRICS_AVATARS}
        pullHeads={new Set<string>()}
        currentBranch={null}
        onSelect={() => {}}
        onCheckoutRef={() => {}}
        onRun={() => {}}
        onConfirm={() => {}}
        onCopy={() => {}}
        onAsk={() => {}}
        onWorktree={() => {}}
        onOpenUrl={() => {}}
        onNeed={(chunks) => asked.push(chunks)}
        message=""
        onMessage={() => {}}
        onCommit={() => {}}
        compact={false}
        onCompact={() => {}}
      />,
    );

    expect(asked.length).toBeGreaterThan(0);
    expect(asked[0]).toContain(0);
  });

  it('a right click on a commit row opens the menu, and cherry-pick leaves as an operation', () => {
    const rows = new RowCache();
    rows.put(0, window());
    const ran: unknown[] = [];

    const { container } = render(
      <GraphView
        session={sessionWith(CHUNK)}
        avatars={null}
        rows={rows}
        redraw={0}
        metrics={METRICS_AVATARS}
        pullHeads={new Set<string>()}
        currentBranch="main"
        onSelect={() => {}}
        onCheckoutRef={() => {}}
        onRun={(operation) => ran.push(operation)}
        onConfirm={() => {}}
        onCopy={() => {}}
        onAsk={() => {}}
        onWorktree={() => {}}
        onOpenUrl={() => {}}
        onNeed={() => {}}
        message=""
        onMessage={() => {}}
        onCommit={() => {}}
        compact={false}
        onCompact={() => {}}
      />,
    );

    const host = container.querySelector('.relative') as HTMLElement;
    act(() => {
      host.dispatchEvent(
        new MouseEvent('contextmenu', {
          clientX: 500,
          clientY: 100,
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(showNativeMenu, 'the right click calls the native menu').toHaveBeenCalledTimes(1);
    const [sections, label, onAction] = vi.mocked(showNativeMenu).mock.calls[0];
    expect(label('menu.cherryPick'), 'labels come from the i18n dictionary').toBe(
      'Cherry-pick commit',
    );

    const cherry = sections.flat().find((i) => i.id === 'cherryPick')!;
    onAction(cherry.action!);
    expect(ran, 'the operation carries the hash of the row under the cursor').toEqual([
      { kind: 'cherryPick', hash: 'h2' },
    ]);
  });

  it('a render of App with new callbacks does not reset the scroll to the top', async () => {
    const rows = new RowCache();
    rows.put(0, workingTreeFirst());

    const view = (onNeed: (chunks: number[]) => void, redraw: number) => (
      <GraphView
        session={sessionWith(CHUNK)}
        avatars={null}
        rows={rows}
        redraw={redraw}
        metrics={METRICS_AVATARS}
        pullHeads={new Set<string>()}
        currentBranch={null}
        onSelect={() => {}}
        onCheckoutRef={() => {}}
        onRun={() => {}}
        onConfirm={() => {}}
        onCopy={() => {}}
        onAsk={() => {}}
        onWorktree={() => {}}
        onOpenUrl={() => {}}
        onNeed={onNeed}
        message=""
        onMessage={() => {}}
        onCommit={() => {}}
        compact={false}
        onCompact={() => {}}
      />
    );

    const { container, rerender } = render(view(() => {}, 0));
    const host = container.querySelector('.relative') as HTMLElement;
    const input = host.querySelector('input')!.parentElement as HTMLElement;

    const wheel = (deltaY: number) =>
      act(() => {
        host.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }));
      });

    wheel(-99999);
    await settleFrames();
    expect(input.style.display, 'at the top the working tree row is visible').toBe('block');

    wheel(3000);
    await settleFrames();
    expect(input.style.display, 'after scrolling down the working tree row is hidden').toBe('none');

    rerender(view(() => {}, 1));
    await settleFrames();
    expect(
      input.style.display,
      'a render from outside must not scroll the graph back to the top',
    ).toBe('none');
  });
});

describe('hovering a commit node', () => {
  const props = {
    avatars: null,
    redraw: 0,
    metrics: METRICS_AVATARS,
    pullHeads: new Set<string>(),
    currentBranch: null,
    onSelect: () => {},
    onCheckoutRef: () => {},
    onRun: () => {},
    onConfirm: () => {},
    onCopy: () => {},
    onAsk: () => {},
    onWorktree: () => {},
    onOpenUrl: () => {},
    onNeed: () => {},
    message: '',
    onMessage: () => {},
    onCommit: () => {},
    compact: false,
    onCompact: () => {},
  };

  it('names the author and the co-authors from the trailers', async () => {
    const rows = new RowCache();
    const filled = window();
    filled.rows[2] = {
      ...(row(2) as Extract<RowView, { kind: 'commit' }>),
      body: 'Body\n\nCo-authored-by: Ada <ada@example.com>\n',
    };
    rows.put(0, filled);
    const { container } = render(
      <TooltipProvider>
        <GraphView session={sessionWith(CHUNK)} rows={rows} {...props} />
      </TooltipProvider>,
    );
    const host = container.querySelector<HTMLElement>('[tabindex="0"]')!;
    const m = METRICS_AVATARS;
    const g = graphGeometry(m, 4, 0, layoutColumns(listWidth(800, false), {}));

    await act(async () => {
      fireEvent.mouseMove(host, { clientX: g.nodeX(0), clientY: rowTop(m, 2, 0) + m.rowH / 2 });
    });

    expect(
      (await screen.findAllByText('pr0d <p@example.com>, Ada <ada@example.com>')).length,
      'the tooltip carries every person the commit belongs to',
    ).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.mouseMove(host, {
        clientX: g.nodeX(0) + m.nodeR + 40,
        clientY: rowTop(m, 2, 0) + m.rowH / 2,
      });
    });
    expect(
      screen.queryByText('pr0d <p@example.com>, Ada <ada@example.com>'),
      'off the node the tooltip is gone',
    ).toBeNull();
  });
});

describe('double-clicking a branch chip', () => {
  const canvasStub = () =>
    new Proxy(
      {
        canvas: { width: 0, height: 0 },
        measureText: (text: string) => ({ width: text.length * 7 }),
        createLinearGradient: () => ({ addColorStop: () => {} }),
        font: '',
      } as Record<string, unknown>,
      {
        get(target, key: string) {
          if (key in target) return target[key];
          return () => {};
        },
        set(target, key: string, value: unknown) {
          target[key] = value;
          return true;
        },
      },
    );

  const longName = 'very-long-branch-name-that-does-not-fit-in-the-branch-column';
  const branch: RefView = {
    name: longName,
    kind: 'localBranch',
    commit: 3,
    oid: 'h3',
    isHead: false,
    upstream: null,
    ahead: 0,
    behind: 0,
    gone: false,
  };

  const mount = (onCheckoutRef: (ref: RefView) => void) => {
    const rows = new RowCache();
    rows.put(0, window());
    const session: Session = {
      ...sessionWith(CHUNK),
      repo: { ...repo(CHUNK), refs: [branch] },
      refsByCommit: new Map([[3, [branch]]]),
    };
    const { container } = render(
      <GraphView
        session={session}
        avatars={null}
        rows={rows}
        redraw={0}
        metrics={METRICS_AVATARS}
        pullHeads={new Set<string>()}
        currentBranch="main"
        onSelect={() => {}}
        onCheckoutRef={onCheckoutRef}
        onRun={() => {}}
        onConfirm={() => {}}
        onCopy={() => {}}
        onAsk={() => {}}
        onWorktree={() => {}}
        onOpenUrl={() => {}}
        onNeed={() => {}}
        message=""
        onMessage={() => {}}
        onCommit={() => {}}
        compact={false}
        onCompact={() => {}}
      />,
    );
    return container.querySelector('.relative') as HTMLElement;
  };

  const mouse = (host: HTMLElement, type: string, x: number, y: number) =>
    act(() => {
      host.dispatchEvent(
        new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true }),
      );
    });

  it('checks the branch out, also when the click lands on the unfolded full name past the truncated chip', async () => {
    const stub = canvasStub();
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => stub as unknown as CanvasRenderingContext2D);
    vi.stubGlobal(
      'Path2D',
      class {
        moveTo() {}
        lineTo() {}
        arcTo() {}
      },
    );
    try {
      const checkedOut: RefView[] = [];
      const host = mount((ref) => checkedOut.push(ref));
      await settleFrames();
      const rowY = rowTop(METRICS_AVATARS, 3, 0) + METRICS_AVATARS.rowH / 2;

      await mouse(host, 'mousemove', 30, rowY);
      await settleFrames();
      await mouse(host, 'dblclick', 30, rowY);
      expect(
        checkedOut.map((r) => r.name),
        'on the chip itself',
      ).toEqual([longName]);

      await mouse(host, 'mousemove', 300, rowY);
      await settleFrames();
      await mouse(host, 'dblclick', 300, rowY);
      expect(
        checkedOut.length,
        'the unfolded name is 400 px wide while the chip under it is cut at the column: a click on the name is a click on the branch',
      ).toBe(2);
    } finally {
      getContext.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
