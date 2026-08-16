import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Profiler, useState } from 'react';
import { act, render } from '@testing-library/react';
import { GraphView } from './GraphView';
import { showNativeMenu } from '@/features/menus';

vi.mock('@/features/menus', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  showNativeMenu: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(showNativeMenu).mockClear();
});
import { CHUNK, RowCache } from '@/entities/graph';
import { METRICS_AVATARS } from '@/entities/graph';
import '../i18n';
import { newSession, type Session } from '@/entities/repo';
import type { RepoView, RowView, WindowView } from '@/types';

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
