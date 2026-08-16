import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';
import { Hint } from '@/shared/ui/tooltip';
import { cn } from '@/shared/lib/utils';
import type { Confirmation, Session } from '@/entities/repo';
import { GIT } from '@/shared/config/vocabulary';
import { Icon, type IconName } from '@/shared/ui/icons';
import { buildRefTree, filterRefTree, flattenRefTree, type FlatRef } from '@/entities/graph';
import { chipsFor } from '@/entities/graph';
import { buildChipMenu, type MenuAction } from '@/features/menus';
import { showNativeMenu } from '@/features/menus';
import { useRepoWork } from '@/features/repo';
import { usePref } from '@/shared/lib/prefs';
import { clampPanel, PANEL_LIMITS } from '@/shared/lib/resize';
import {
  HOVER_FILL,
  InlineNote,
  ListRow,
  NavItem,
  ResizeGrip,
  SearchField,
} from '@/shared/ui/parts';
import { useCommands } from '@/features/keyboard';
import { rovingTabIndex, stepped } from '@/shared/lib/roving';
import type { Ask } from './AskBar';
import type {
  Operation,
  PullListView,
  PullView,
  RefKind,
  RefView,
  WorktreeView,
} from '@/shared/api/types';

type Props = {
  session: Session | null;
  pulls: PullListView | null;
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
  onPullsExpanded: () => void;
  onPickPull: (pull: PullView) => void;
};

type ViewKey = 'local' | 'remote' | 'worktrees' | 'tags' | 'pullRequests';

const VIEWS: ReadonlyArray<{ key: ViewKey; title: string; icon: IconName }> = [
  { key: 'local', title: GIT.local, icon: 'branch' },
  { key: 'remote', title: GIT.remote, icon: 'remote' },
  { key: 'worktrees', title: GIT.worktrees, icon: 'worktree' },
  { key: 'tags', title: GIT.tags, icon: 'tag' },
  { key: 'pullRequests', title: GIT.pullRequests, icon: 'pullRequest' },
];

const CAP = 99;
const ROW_PITCH = 33;
const OVERSCAN = 8;

const capped = (count: number) => (count > CAP ? `${CAP}+` : `${count}`);

function Tracking({ view, onDelete }: { view: RefView; onDelete: (ref: RefView) => void }) {
  const { t } = useTranslation();
  if (view.gone && view.isHead) {
    return (
      <Hint text={t('branch.goneCurrent')}>
        <span className="text-deleted flex shrink-0 items-center" aria-label={t('branch.gone')}>
          <Icon.upstreamGone className="size-3" />
        </span>
      </Hint>
    );
  }
  if (view.gone) {
    return (
      <Hint text={t('branch.gone')}>
        <Button
          variant="ghost"
          size="icon-2xs"
          className="text-deleted hover:text-deleted shrink-0"
          aria-label={t('branch.goneDelete', { name: view.name })}
          onClick={(event) => {
            event.stopPropagation();
            onDelete(view);
          }}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <Icon.upstreamGone />
        </Button>
      </Hint>
    );
  }
  if (!view.ahead && !view.behind) return null;

  return (
    <span className="text-2xs flex shrink-0 items-center gap-1 tabular-nums">
      {view.ahead ? (
        <span className="text-ahead flex items-center">
          {capped(view.ahead)}
          <Icon.up className="size-3" />
        </span>
      ) : null}
      {view.behind ? (
        <span className="text-behind flex items-center">
          {capped(view.behind)}
          <Icon.down className="size-3" />
        </span>
      ) : null}
    </span>
  );
}

const RefRow = memo(function RefRow({
  item,
  checkingOut,
  selected,
  tabIndex,
  onPick,
  onCheckout,
  onMenu,
  onDelete,
}: {
  item: Extract<FlatRef, { kind: 'ref' }>;
  checkingOut: string | null;
  selected: boolean;
  tabIndex: 0 | -1;
  onPick: (commit: number) => void;
  onCheckout: (ref: RefView) => void;
  onMenu: (ref: RefView) => void;
  onDelete: (ref: RefView) => void;
}) {
  const view = item.ref;
  return (
    <ListRow
      depth={item.depth}
      gutter={view.isHead ? <Icon.current className="text-ref-current size-3.5" /> : null}
      current={view.isHead}
      selected={selected}
      tabIndex={tabIndex}
      title={item.path === item.name ? undefined : item.path}
      onClick={() => onPick(view.commit)}
      onDoubleClick={() => onCheckout(view)}
      onContextMenu={() => onMenu(view)}
    >
      {checkingOut === view.name ? (
        <Icon.waiting className="text-faint size-3.5 shrink-0 animate-spin" />
      ) : (
        <Icon.branch className="text-faint size-3.5 shrink-0" />
      )}
      <span className="min-w-0 flex-1 truncate">{item.name}</span>
      <Tracking view={view} onDelete={onDelete} />
    </ListRow>
  );
});

const FolderRow = memo(function FolderRow({
  item,
  selected,
  tabIndex,
  onFlip,
}: {
  item: Extract<FlatRef, { kind: 'folder' }>;
  selected: boolean;
  tabIndex: 0 | -1;
  onFlip: (path: string) => void;
}) {
  const Glyph = item.open ? Icon.open : Icon.folder;
  return (
    <ListRow
      depth={item.depth}
      gutter={null}
      selected={selected}
      tabIndex={tabIndex}
      title={item.path}
      onClick={() => onFlip(item.path)}
    >
      <Glyph className="text-faint size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{item.name}</span>
    </ListRow>
  );
});

const TagRow = memo(function TagRow({
  view,
  selected,
  tabIndex,
  onPick,
  onMenu,
}: {
  view: RefView;
  selected: boolean;
  tabIndex: 0 | -1;
  onPick: (commit: number) => void;
  onMenu: (ref: RefView) => void;
}) {
  return (
    <ListRow
      gutter={null}
      selected={selected}
      tabIndex={tabIndex}
      onClick={() => onPick(view.commit)}
      onContextMenu={() => onMenu(view)}
    >
      <Icon.tag className="text-faint size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{view.name}</span>
    </ListRow>
  );
});

const WorktreeRow = memo(function WorktreeRow({
  view,
  selected,
  tabIndex,
}: {
  view: WorktreeView;
  selected: boolean;
  tabIndex: 0 | -1;
}) {
  return (
    <ListRow
      gutter={view.isMain ? <Icon.current className="text-ref-current size-3.5" /> : null}
      current={view.isMain}
      selected={selected}
      tabIndex={tabIndex}
      title={view.path}
    >
      <Icon.worktree className="text-faint size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{view.name}</span>
      {view.branch ? (
        <span className="text-faint max-w-1/2 shrink truncate">{view.branch}</span>
      ) : null}
    </ListRow>
  );
});

const pullRank = (pull: PullView): number =>
  pull.mine ? 0 : pull.assignedToMe || pull.awaitingMyReview ? 1 : 2;

const PullRow = memo(function PullRow({
  pull,
  selected,
  tabIndex,
  onPickPull,
}: {
  pull: PullView;
  selected: boolean;
  tabIndex: 0 | -1;
  onPickPull: (pull: PullView) => void;
}) {
  return (
    <ListRow
      gutter={null}
      selected={selected}
      tabIndex={tabIndex}
      title={pull.title}
      onClick={() => onPickPull(pull)}
    >
      <Icon.pullRequest className="text-faint size-3.5 shrink-0" />
      <span className="text-faint shrink-0 tabular-nums">#{pull.number}</span>
      <span className="min-w-0 flex-1 truncate">{pull.title}</span>
    </ListRow>
  );
});

function ViewSwitch({
  active,
  counts,
  onPick,
}: {
  active: ViewKey;
  counts: Record<ViewKey, number | null>;
  onPick: (key: ViewKey) => void;
}) {
  return (
    <div className="mx-2.5 mb-2 flex shrink-0 items-center gap-0.5">
      {VIEWS.map(({ key, title, icon }) => {
        const Glyph = Icon[icon];
        const count = counts[key];
        const chosen = key === active;
        return (
          <Hint key={key} text={count === null ? title : `${title} · ${count}`}>
            <button
              aria-label={title}
              aria-pressed={chosen}
              onClick={() => onPick(key)}
              className={cn(
                'flex h-8 items-center rounded-full px-2 text-xs transition-colors',
                chosen
                  ? 'bg-control-fill text-foreground min-w-0 font-medium'
                  : cn(HOVER_FILL, 'text-muted-foreground hover:text-foreground shrink-0'),
              )}
            >
              <Glyph className="size-3.5 shrink-0" />
              {chosen ? (
                <span className="animate-in fade-in flex min-w-0 items-center gap-1.5 pl-1.5 duration-150">
                  <span className="truncate">{title}</span>
                  {count === null ? null : (
                    <span className="text-faint shrink-0 tabular-nums">{capped(count)}</span>
                  )}
                </span>
              ) : null}
            </button>
          </Hint>
        );
      })}
    </div>
  );
}

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
  onPullsExpanded,
  onPickPull,
}: Props) {
  const { t } = useTranslation();
  const work = useRepoWork(session?.path ?? null);
  const checkingOut = work?.kind === 'checkout' ? (work.target ?? null) : null;
  const [view, setView] = usePref<ViewKey>('sidebar.view', 'local');
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

  const openRefMenu = useCallback(
    (ref: RefView) => {
      const chip = chipsFor([ref], remoteNames)[0];
      if (!chip) return;
      const sections = buildChipMenu(chip, {
        currentBranch,
        remotes: remotes.map((r) => ({ name: r.name, webUrl: r.webUrl })),
        head: null,
      });
      if (!sections.length) return;
      void showNativeMenu(
        sections,
        (key, params) => t(key as 'menu.copyBranch', params),
        (action: MenuAction) => {
          if (action.kind === 'checkoutRef') onCheckout(action.ref);
          else if (action.kind === 'run') onRun(action.operation);
          else if (action.kind === 'copy') onCopy(action.text);
          else if (action.kind === 'worktree') onWorktree(action.at);
          else if (action.kind === 'openUrl') onOpenUrl(action.url);
          else if (action.kind === 'ask') onAsk(action.ask);
          else if (action.kind === 'confirm') onConfirm(action.confirmation);
        },
      );
    },
    [
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
      t,
    ],
  );

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
    return [...(pulls?.pulls ?? [])]
      .sort((a, b) => pullRank(a) - pullRank(b))
      .map((pull) => ({ kind: 'pull', pull }));
  }, [view, matching, closed, shownWorktrees, tags, pulls]);

  const counts: Record<ViewKey, number | null> = {
    local: ofKind('localBranch').length,
    remote: ofKind('remoteBranch').length,
    worktrees: worktrees.length,
    tags: ofKind('tag').length,
    pullRequests: pulls?.pulls.length ?? null,
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
    if (key === 'pullRequests' && pulls === null) onPullsExpanded();
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
        {VIEWS.map(({ key, title, icon }) => (
          <NavItem
            key={key}
            icon={icon}
            name={title}
            active={key === view}
            hint={counts[key] === null ? title : `${title} · ${counts[key]}`}
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

      <ViewSwitch active={view} counts={counts} onPick={pickView} />

      <div
        ref={listRef}
        data-area="refs"
        data-slot="sidebar-rows"
        role="listbox"
        aria-label={VIEWS.find((known) => known.key === view)?.title}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2.5"
      >
        {view === 'pullRequests' && pulls === null ? (
          <InlineNote>
            <Icon.waiting className="size-3 animate-spin" />
            {t('host.loading')}
          </InlineNote>
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
            {view === 'pullRequests' && pulls?.truncated ? (
              <InlineNote>{t('pull.truncated', { count: pulls.pulls.length })}</InlineNote>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}
