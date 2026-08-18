import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';
import { Hint } from '@/shared/ui/tooltip';
import { pullsOf, type Confirmation, type PullsState, type Session } from '@/entities/repo';
import { Icon } from '@/shared/ui/icons';
import { buildRefTree, filterRefTree, flattenRefTree, type FlatRef } from '@/entities/graph';
import { useRepoWork } from '@/features/repo';
import { usePref } from '@/shared/lib/prefs';
import { clampPanel, PANEL_LIMITS } from '@/shared/lib/resize';
import { InlineNote, NavItem, ResizeGrip, SearchField } from '@/shared/ui/parts';
import { useCommands } from '@/features/keyboard';
import { rovingTabIndex, stepped } from '@/shared/lib/roving';
import type { Ask } from '../AskBar';
import type { Operation, PullView, RefKind, RefView, WorktreeView } from '@/shared/api/types';
import { FolderRow, PullRow, pullRank, RefRow, TagRow, WorktreeRow } from './rows';
import { PullsNote } from './PullsNote';
import { useRefMenu } from './useRefMenu';
import { ViewSwitch } from './ViewSwitch';
import { OVERSCAN, ROW_PITCH, VIEW_TITLE, VIEWS, type ViewKey } from './views';

type Props = {
  session: Session | null;
  pulls: PullsState;
  collapsed: boolean;
  onToggle: () => void;
  currentBranch: string | null;
  onPick: (commit: number) => void;
  onCheckout: (ref: RefView) => void;
  onRun: (operation: Operation) => void;
  onConfirm: (confirmation: Confirmation) => void;
  onCopy: (text: string) => void;
  onAsk: (ask: Ask) => void;
  onWorktree: (at: string) => void;
  onOpenUrl: (url: string) => void;
  onLoadPulls: () => void;
  onConnect: () => void;
  onPickPull: (pull: PullView) => void;
};

type Item =
  | FlatRef
  | { kind: 'worktree'; worktree: WorktreeView }
  | { kind: 'tag'; ref: RefView }
  | { kind: 'pull'; pull: PullView };

const keyOf = (item: Item): string => {
  switch (item.kind) {
    case 'worktree':
      return item.worktree.path;
    case 'tag':
      return item.ref.name;
    case 'pull':
      return String(item.pull.number);
    default:
      return item.path;
  }
};

export function Sidebar({
  session,
  pulls,
  collapsed,
  onToggle,
  currentBranch,
  onPick,
  onCheckout,
  onRun,
  onConfirm,
  onCopy,
  onAsk,
  onWorktree,
  onOpenUrl,
  onLoadPulls,
  onConnect,
  onPickPull,
}: Props) {
  const { t } = useTranslation();
  const work = useRepoWork(session?.path ?? null);
  const checkingOut = work?.kind === 'checkout' ? (work.target ?? null) : null;
  const [storedView, setView] = usePref<ViewKey>('sidebar.view', 'local');
  const shownViews =
    pulls.kind === 'noHost' ? VIEWS.filter((v) => v.key !== 'pullRequests') : VIEWS;
  const view: ViewKey =
    storedView === 'pullRequests' && pulls.kind === 'noHost' ? 'local' : storedView;
  const [width, setWidth] = usePref<number>('sidebar.width', PANEL_LIMITS.sidebar.fallback);
  const dragFrom = useRef(width);
  const [filter, setFilter] = useState('');
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const [cursor, setCursor] = useState(-1);
  const [first, setFirst] = useState(0);
  const [viewportH, setViewportH] = useState(600);
  const listRef = useRef<HTMLDivElement | null>(null);

  const flipFolder = useCallback(
    (path: string) =>
      setClosed((now) => {
        const next = new Set(now);
        if (!next.delete(path)) next.add(path);
        return next;
      }),
    [],
  );

  const refs = useMemo(() => session?.repo?.refs ?? [], [session?.repo?.refs]);
  const remotes = useMemo(() => session?.repo?.remotes ?? [], [session?.repo?.remotes]);
  const remoteNames = useMemo(() => remotes.map((r) => r.name), [remotes]);
  const worktrees = useMemo(() => session?.worktrees ?? [], [session?.worktrees]);

  const askToDelete = useCallback(
    (ref: RefView) =>
      onConfirm({ kind: 'operation', operation: { kind: 'branchDelete', name: ref.name } }),
    [onConfirm],
  );

  const openRefMenu = useRefMenu({
    remotes,
    remoteNames,
    currentBranch,
    onCheckout,
    onRun,
    onConfirm,
    onCopy,
    onAsk,
    onWorktree,
    onOpenUrl,
  });

  const ofKind = useCallback((kind: RefKind) => refs.filter((r) => r.kind === kind), [refs]);

  const trees = useMemo(
    () => ({
      local: buildRefTree(ofKind('localBranch')),
      remote: buildRefTree(ofKind('remoteBranch')),
    }),
    [ofKind],
  );

  const needle = filter.trim().toLowerCase();

  const matching = useMemo(
    () => ({
      local: filterRefTree(trees.local, needle),
      remote: filterRefTree(trees.remote, needle),
    }),
    [trees, needle],
  );

  const tags = useMemo(
    () => ofKind('tag').filter((r) => r.name.toLowerCase().includes(needle)),
    [ofKind, needle],
  );
  const shownWorktrees = useMemo(
    () => worktrees.filter((w) => w.name.toLowerCase().includes(needle)),
    [worktrees, needle],
  );

  const items: Item[] = useMemo(() => {
    if (view === 'local' || view === 'remote') return flattenRefTree(matching[view], closed);
    if (view === 'worktrees')
      return shownWorktrees.map((worktree) => ({ kind: 'worktree', worktree }));
    if (view === 'tags') return tags.map((ref) => ({ kind: 'tag', ref }));
    return [...pullsOf(pulls)]
      .sort((a, b) => pullRank(a) - pullRank(b))
      .map((pull) => ({ kind: 'pull', pull }));
  }, [view, matching, closed, shownWorktrees, tags, pulls]);

  const counts: Record<ViewKey, number | null> = {
    local: ofKind('localBranch').length,
    remote: ofKind('remoteBranch').length,
    worktrees: worktrees.length,
    tags: ofKind('tag').length,
    pullRequests: pulls.kind === 'ready' ? pulls.list.pulls.length : null,
  };

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => setViewportH(list.clientHeight || 600);
    measure();
    const watcher = new ResizeObserver(measure);
    watcher.observe(list);
    return () => watcher.disconnect();
  }, []);

  useEffect(() => {
    setFirst(0);
    setCursor(-1);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [view, needle]);

  const revealRow = (index: number) => {
    const list = listRef.current;
    if (!list) return;
    const top = index * ROW_PITCH;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (top + ROW_PITCH > list.scrollTop + list.clientHeight) {
      list.scrollTop = top + ROW_PITCH - list.clientHeight;
    }
  };

  const openItem = (item: Item) => {
    switch (item.kind) {
      case 'folder':
        flipFolder(item.path);
        return;
      case 'ref':
        onPick(item.ref.commit);
        return;
      case 'tag':
        onPick(item.ref.commit);
        return;
      case 'pull':
        onPickPull(item.pull);
        return;
      default:
        return;
    }
  };

  const moveTo = (index: number) => {
    if (index < 0 || index >= items.length) return;
    setCursor(index);
    revealRow(index);
  };

  useCommands('refs', {
    selectNext: () => moveTo(stepped(cursor, 1, items.length)),
    selectPrevious: () => moveTo(stepped(cursor, -1, items.length)),
    selectFirst: () => moveTo(0),
    selectLast: () => moveTo(items.length - 1),
    openSelected: () => {
      const item = items[cursor];
      if (item) openItem(item);
    },
  });

  const pickView = (key: ViewKey) => {
    if (key === 'pullRequests' && pulls.kind === 'idle') onLoadPulls();
    setView(key);
  };

  const onScroll = () => {
    const list = listRef.current;
    if (!list) return;
    const next = Math.max(0, Math.floor(list.scrollTop / ROW_PITCH) - OVERSCAN);
    if (next !== first) setFirst(next);
  };

  const last = Math.min(items.length, first + Math.ceil(viewportH / ROW_PITCH) + OVERSCAN * 2);

  const renderItem = (item: Item, index: number) => {
    const selected = index === cursor;
    const tabIndex = rovingTabIndex(cursor, index);
    switch (item.kind) {
      case 'folder':
        return (
          <FolderRow item={item} selected={selected} tabIndex={tabIndex} onFlip={flipFolder} />
        );
      case 'ref':
        return (
          <RefRow
            item={item}
            checkingOut={checkingOut}
            selected={selected}
            tabIndex={tabIndex}
            onPick={onPick}
            onCheckout={onCheckout}
            onMenu={openRefMenu}
            onDelete={askToDelete}
          />
        );
      case 'worktree':
        return <WorktreeRow view={item.worktree} selected={selected} tabIndex={tabIndex} />;
      case 'tag':
        return (
          <TagRow
            view={item.ref}
            selected={selected}
            tabIndex={tabIndex}
            onPick={onPick}
            onMenu={openRefMenu}
          />
        );
      case 'pull':
        return (
          <PullRow
            pull={item.pull}
            selected={selected}
            tabIndex={tabIndex}
            onPickPull={onPickPull}
          />
        );
    }
  };

  if (collapsed) {
    return (
      <aside className="flex w-12 shrink-0 flex-col items-center gap-1">
        <NavItem icon="expand" hint={t('sidebar.expand')} hintSide="right" onClick={onToggle} />
        <span className="h-1" />
        {shownViews.map(({ key, title, icon }) => (
          <NavItem
            key={key}
            icon={icon}
            name={t(title)}
            active={key === view}
            hint={counts[key] === null ? t(title) : `${t(title)} · ${counts[key]}`}
            hintSide="right"
            onClick={() => {
              pickView(key);
              onToggle();
            }}
          />
        ))}
      </aside>
    );
  }

  return (
    <aside
      className="relative flex shrink-0 flex-col"
      style={{ width: clampPanel('sidebar', width) }}
    >
      <ResizeGrip
        name="sidebar"
        label={t('resize.sidebar')}
        edge="right"
        onStart={() => {
          dragFrom.current = clampPanel('sidebar', width);
        }}
        onMove={(dx) => setWidth(clampPanel('sidebar', dragFrom.current + dx))}
        onEnd={() => {}}
      />
      <div className="flex items-center gap-1 px-2.5 pb-2">
        <SearchField value={filter} placeholder={t('sidebar.filter')} onChange={setFilter} />
        <Hint text={t('sidebar.collapse')}>
          <Button
            variant="field"
            size="icon-sm"
            aria-label={t('sidebar.collapse')}
            onClick={onToggle}
          >
            <Icon.collapse className="size-4" />
          </Button>
        </Hint>
      </div>

      <ViewSwitch views={shownViews} active={view} counts={counts} onPick={pickView} />

      <div
        ref={listRef}
        data-area="refs"
        data-slot="sidebar-rows"
        role="listbox"
        aria-label={t(VIEW_TITLE[view])}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2.5"
      >
        {view === 'pullRequests' && pulls.kind !== 'ready' ? (
          <PullsNote state={pulls} onRetry={onLoadPulls} onConnect={onConnect} />
        ) : items.length === 0 ? (
          <InlineNote>{t(view === 'pullRequests' ? 'pull.empty' : 'sidebar.nothing')}</InlineNote>
        ) : (
          <>
            <div style={{ height: first * ROW_PITCH }} />
            {items.slice(first, last).map((item, offset) => (
              <div key={keyOf(item)} style={{ height: ROW_PITCH }}>
                {renderItem(item, first + offset)}
              </div>
            ))}
            <div style={{ height: Math.max(0, (items.length - last) * ROW_PITCH) }} />
            {view === 'pullRequests' && pulls.kind === 'ready' && pulls.list.truncated ? (
              <InlineNote>{t('pull.truncated', { count: pulls.list.pulls.length })}</InlineNote>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}
