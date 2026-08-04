import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Sidebar } from './Sidebar';
import { showNativeMenu } from '../nativeMenu';
import { newSession, type Session } from '../session';
import type { RefView, RepoView } from '../types';

vi.mock('../nativeMenu', () => ({ showNativeMenu: vi.fn() }));

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
        collapsed={false}
        pulls={null}
        checkingOut={null}
        currentBranch="main"
        onPick={handlers.onPick ?? (() => {})}
        onCheckout={handlers.onCheckout ?? (() => {})}
        onRun={() => {}}
        onCopy={() => {}}
        onAsk={() => {}}
        onWorktree={() => {}}
        onOpenUrl={() => {}}
        onToggle={() => {}}
        onPullsExpanded={() => {}}
        onPickPull={() => {}}
      />
    </TooltipProvider>,
  );

const row = (name: string) => screen.getByText(name).closest('button') as HTMLElement;

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
