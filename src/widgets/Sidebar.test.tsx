import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => localStorage.clear());
import { TooltipProvider } from '@/components/ui/tooltip';
import { Sidebar } from './Sidebar';
import { showNativeMenu } from '@/features/menus';
import { newSession, type Session } from '@/entities/repo';
import type { RefView, RepoView } from '@/types';

vi.mock('@/features/menus', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  showNativeMenu: vi.fn(),
}));

const drawn = vi.hoisted(() => ({ branchRows: 0 }));

vi.mock('@/icons', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/icons')>();
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

const draw = (refs: RefView[], handlers: { onPick?: () => void; onCheckout?: () => void } = {}) =>
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

describe('перерисовка списков', () => {
  it('переключение вида не перерисовывает строки, которых оно не касается', () => {
    draw([branch({ name: 'main', ahead: 1 }), branch({ name: 'feature', ahead: 2 })]);
    drawn.branchRows = 0;

    fireEvent.click(screen.getByRole('button', { name: 'Tags' }));

    expect(
      drawn.branchRows,
      'строки веток не перерисовываются, когда открыт другой вид',
    ).toBe(0);
  });
});

describe('окно списка', () => {
  const thousand = () =>
    Array.from({ length: 1000 }, (_, i) => branch({ name: `b-${String(i).padStart(4, '0')}` }));

  it('тысяча веток не превращается в тысячу строк', () => {
    draw(thousand());

    expect(
      document.querySelectorAll('button').length,
      'рисуется окно видимых строк, а не весь список',
    ).toBeLessThan(120);
  });

  it('прокрутка доводит до дальних строк, а начало уходит из окна', () => {
    draw(thousand());
    const list = document.querySelector('[data-slot="sidebar-rows"]') as HTMLElement;

    list.scrollTop = 500 * 33;
    fireEvent.scroll(list);

    expect(screen.getByText('b-0500')).toBeTruthy();
    expect(screen.queryByText('b-0001'), 'начало списка выгружено').toBeNull();
  });
});

describe('свёрнутый сайдбар', () => {
  it('рейка иконок вместо пустоты: щелчок по виду раскрывает панель', () => {
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
          onCopy={() => {}}
          onAsk={() => {}}
          onWorktree={() => {}}
          onOpenUrl={() => {}}
          onPullsExpanded={() => {}}
          onPickPull={() => {}}
        />
      </TooltipProvider>,
    );

    expect(screen.queryByPlaceholderText(/filter/i), 'фильтра в рейке нет').toBeNull();
    expect(screen.getByRole('button', { name: 'Tags' }), 'иконки видов остались').toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Tags' }));

    expect(onToggle, 'щелчок по иконке раскрывает панель').toHaveBeenCalledTimes(1);
  });
});

describe('щелчки по ветке', () => {
  it('одинарный щелчок выделяет коммит и не переключает ветку', () => {
    const onPick = vi.fn();
    const onCheckout = vi.fn();
    draw([branch()], { onPick, onCheckout });

    fireEvent.click(row('main'));

    expect(onPick).toHaveBeenCalledWith(7);
    expect(onCheckout).not.toHaveBeenCalled();
  });

  it('двойной щелчок переключает на ветку', () => {
    const onCheckout = vi.fn();
    draw([branch()], { onCheckout });

    fireEvent.doubleClick(row('main'));

    expect(onCheckout).toHaveBeenCalledTimes(1);
  });

  it('правый щелчок по ветке открывает то же меню, что и на графе', () => {
    vi.mocked(showNativeMenu).mockClear();
    draw([branch({ name: 'feature' })]);

    fireEvent.contextMenu(screen.getByText('feature'));

    expect(showNativeMenu).toHaveBeenCalledTimes(1);
    const [sections] = vi.mocked(showNativeMenu).mock.calls[0];
    expect(
      sections.flat().map((i) => i.id),
      'меню строится тем же строителем, что и на графе',
    ).toContain('checkout');
  });

  it('щелчок по стрелке не промахивается мимо ветки', () => {
    const onPick = vi.fn();
    draw([branch({ ahead: 3 })], { onPick });

    fireEvent.click(screen.getByText('3'));

    expect(onPick).toHaveBeenCalledWith(7);
  });
});

describe('дерево и стрелки', () => {
  it('ветка в папке показывается коротким именем, папка отдельной строкой', () => {
    draw([branch({ name: 'pr/36451' })]);

    expect(row('pr').textContent).toBe('pr');
    expect(row('36451').textContent).toBe('36451');
  });

  it('папки раскрыты сразу, иначе репозиторий открывается без единой ветки', () => {
    draw([branch({ name: 'a/b/c/deep' })]);

    expect(row('deep')).toBeDefined();
  });

  it('без upstream стрелок нет вовсе, а не нули', () => {
    draw([branch()]);

    expect(row('main').textContent).toBe('main');
  });

  it('впереди и позади показываются числами рядом с именем', () => {
    draw([branch({ ahead: 3, behind: 1 })]);

    expect(row('main').textContent).toBe('main31');
  });

  it('больше сотни показывается потолком, а не точным числом', () => {
    draw([branch({ behind: 1234 })]);

    expect(row('main').textContent).toBe('main99+');
  });
});
