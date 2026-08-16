import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => localStorage.clear());
import { TooltipProvider } from '@/shared/ui/tooltip';
import { Sidebar } from './Sidebar';
import { showNativeMenu } from '@/features/menus';
import { newSession, type Confirmation, type Session } from '@/entities/repo';
import type { RefView, RepoView } from '@/shared/api/types';

vi.mock('@/features/menus', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  showNativeMenu: vi.fn(),
}));

const drawn = vi.hoisted(() => ({ branchRows: 0 }));

vi.mock('@/shared/ui/icons', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/shared/ui/icons')>();
  const Up = real.Icon.up;
  return {
    ...real,
    Icon: {
      ...real.Icon,
      up: (props: React.ComponentProps<typeof Up>) => {
        drawn.branchRows += 1;
        return <Up {...props} />;
      },
    },
  };
});

const branch = (patch: Partial<RefView> = {}): RefView => ({
  name: 'main',
  kind: 'localBranch',
  commit: 7,
  oid: 'refoid',
  isHead: false,
  upstream: null,
  ahead: 0,
  behind: 0,
  gone: false,
  ...patch,
});

const repo = (refs: RefView[]): RepoView => ({
  path: '/repo',
  count: 10,
  maxLane: 1,
  head: 0,
  truncated: false,
  readMs: 0,
  layoutMs: 0,
  minimap: [],
  minimapColours: [],
  remotes: [],
  refs,
});

const sessionWith = (refs: RefView[]): Session => ({
  ...newSession('/repo'),
  repo: repo(refs),
  loading: false,
});

const draw = (
  refs: RefView[],
  handlers: {
    onPick?: () => void;
    onCheckout?: () => void;
    onConfirm?: (confirmation: Confirmation) => void;
  } = {},
) =>
  render(
    <TooltipProvider>
      <Sidebar
        session={sessionWith(refs)}
        pulls={null}
        collapsed={false}
        onToggle={() => {}}
        currentBranch="main"
        onPick={handlers.onPick ?? (() => {})}
        onCheckout={handlers.onCheckout ?? (() => {})}
        onRun={() => {}}
        onConfirm={handlers.onConfirm ?? (() => {})}
        onCopy={() => {}}
        onAsk={() => {}}
        onWorktree={() => {}}
        onOpenUrl={() => {}}
        onPullsExpanded={() => {}}
        onPickPull={() => {}}
      />
    </TooltipProvider>,
  );

const row = (name: string) => screen.getByText(name).closest('button') as HTMLElement;

describe('redrawing the lists', () => {
  it('switching the view does not redraw the rows it does not touch', () => {
    draw([branch({ name: 'main', ahead: 1 }), branch({ name: 'feature', ahead: 2 })]);
    drawn.branchRows = 0;

    fireEvent.click(screen.getByRole('button', { name: 'Tags' }));

    expect(drawn.branchRows, 'branch rows are not redrawn while another view is open').toBe(0);
  });
});

describe('the visible window of the list', () => {
  const thousand = () =>
    Array.from({ length: 1000 }, (_, i) => branch({ name: `b-${String(i).padStart(4, '0')}` }));

  it('a thousand branches do not turn into a thousand rows', () => {
    draw(thousand());

    expect(
      document.querySelectorAll('button').length,
      'only the window of visible rows is drawn, not the whole list',
    ).toBeLessThan(120);
  });

  it('scrolling reaches the far rows, and the beginning leaves the window', () => {
    draw(thousand());
    const list = document.querySelector('[data-slot="sidebar-rows"]') as HTMLElement;

    list.scrollTop = 500 * 33;
    fireEvent.scroll(list);

    expect(screen.getByText('b-0500')).toBeTruthy();
    expect(screen.queryByText('b-0001'), 'the beginning of the list is unmounted').toBeNull();
  });
});

describe('the collapsed sidebar', () => {
  it('an icon rail instead of emptiness: a click on a view expands the panel', () => {
    const onToggle = vi.fn();
    render(
      <TooltipProvider>
        <Sidebar
          session={sessionWith([branch()])}
          pulls={null}
          collapsed
          onToggle={onToggle}
          currentBranch="main"
          onPick={() => {}}
          onCheckout={() => {}}
          onRun={() => {}}
          onConfirm={() => {}}
          onCopy={() => {}}
          onAsk={() => {}}
          onWorktree={() => {}}
          onOpenUrl={() => {}}
          onPullsExpanded={() => {}}
          onPickPull={() => {}}
        />
      </TooltipProvider>,
    );

    expect(screen.queryByPlaceholderText(/filter/i), 'the rail carries no filter').toBeNull();
    expect(
      screen.getByRole('button', { name: 'Tags' }),
      'the view icons are still there',
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Tags' }));

    expect(onToggle, 'a click on an icon expands the panel').toHaveBeenCalledTimes(1);
  });
});

describe('clicks on a branch', () => {
  it('a single click selects the commit and does not check the branch out', () => {
    const onPick = vi.fn();
    const onCheckout = vi.fn();
    draw([branch()], { onPick, onCheckout });

    fireEvent.click(row('main'));

    expect(onPick).toHaveBeenCalledWith(7);
    expect(onCheckout).not.toHaveBeenCalled();
  });

  it('a double click checks the branch out', () => {
    const onCheckout = vi.fn();
    draw([branch()], { onCheckout });

    fireEvent.doubleClick(row('main'));

    expect(onCheckout).toHaveBeenCalledTimes(1);
  });

  it('a right click on a branch opens the same menu as on the graph', () => {
    vi.mocked(showNativeMenu).mockClear();
    draw([branch({ name: 'feature' })]);

    fireEvent.contextMenu(screen.getByText('feature'));

    expect(showNativeMenu).toHaveBeenCalledTimes(1);
    const [sections] = vi.mocked(showNativeMenu).mock.calls[0];
    expect(
      sections.flat().map((i) => i.id),
      'the menu is built by the same builder as on the graph',
    ).toContain('checkout');
  });

  it('a click on the arrow does not miss the branch', () => {
    const onPick = vi.fn();
    draw([branch({ ahead: 3 })], { onPick });

    fireEvent.click(screen.getByText('3'));

    expect(onPick).toHaveBeenCalledWith(7);
  });
});

describe('the tree and the arrows', () => {
  it('a branch inside a folder is shown by its short name, the folder as a row of its own', () => {
    draw([branch({ name: 'pr/36451' })]);

    expect(row('pr').textContent).toBe('pr');
    expect(row('36451').textContent).toBe('36451');
  });

  it('folders are expanded from the start, otherwise a repository opens without a single branch', () => {
    draw([branch({ name: 'a/b/c/deep' })]);

    expect(row('deep')).toBeDefined();
  });

  it('without an upstream there are no arrows at all, rather than zeros', () => {
    draw([branch()]);

    expect(row('main').textContent).toBe('main');
  });

  it('ahead and behind are shown as numbers next to the name', () => {
    draw([branch({ ahead: 3, behind: 1 })]);

    expect(row('main').textContent).toBe('main31');
  });

  it('anything above a hundred is shown as a cap, not as the exact number', () => {
    draw([branch({ behind: 1234 })]);

    expect(row('main').textContent).toBe('main99+');
  });
});

describe('a branch whose upstream is gone', () => {
  it('carries a marker instead of counters: the remote branch was deleted', () => {
    draw([branch({ name: 'feature', upstream: 'origin/feature', gone: true })]);

    expect(
      screen.getByRole('button', { name: /upstream of feature is gone/i }),
      'the marker names the branch and what it offers to do',
    ).toBeTruthy();
    expect(row('feature').textContent, 'no ahead/behind numbers next to a gone upstream').toBe(
      'feature',
    );
  });

  it('clicking the marker asks to delete the branch instead of deleting it', () => {
    const asked: Confirmation[] = [];
    const onPick = vi.fn();
    const onCheckout = vi.fn();
    draw([branch({ name: 'feature', upstream: 'origin/feature', gone: true })], {
      onPick,
      onCheckout,
      onConfirm: (confirmation) => asked.push(confirmation),
    });

    fireEvent.click(screen.getByRole('button', { name: /upstream of feature is gone/i }));

    expect(asked, 'the deletion goes through the confirm bar').toEqual([
      { kind: 'operation', operation: { kind: 'branchDelete', name: 'feature' } },
    ]);
    expect(
      onPick,
      'the click on the marker does not select the row underneath',
    ).not.toHaveBeenCalled();
    expect(onCheckout).not.toHaveBeenCalled();
  });
});

describe('a branch whose upstream is gone', () => {
  it('stays in the list and carries no label, because the branch itself is still there', () => {
    draw([
      branch({ name: 'invoices-pagination', gone: true, upstream: 'origin/invoices-pagination' }),
    ]);

    expect(
      screen.getByText('invoices-pagination'),
      'the branch exists locally, so it has to be shown',
    ).toBeTruthy();
    expect(
      screen.queryByText('gone'),
      'a red label on every other row is noise, and the reference client does not draw it either',
    ).toBeNull();
  });

  it('ahead and behind are still visible', () => {
    draw([branch({ name: 'feature/live', ahead: 2, behind: 3 })]);

    expect(screen.getByText('2'), 'the ahead counter stays').toBeTruthy();
    expect(screen.getByText('3'), 'the behind counter stays').toBeTruthy();
  });
});
