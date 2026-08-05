import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Hint } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { Session } from '../session';
import { GIT } from '../vocabulary';
import { Icon, type IconName } from '../icons';
import { buildRefTree, filterRefTree, flattenRefTree, type FlatRef } from '../refTree';
import { chipsFor } from '../chips';
import { buildChipMenu, type MenuAction } from '../menuItems';
import { showNativeMenu } from '../nativeMenu';
import { usePref } from '../prefs';
import { InlineNote, ListRow } from './parts';
import type { Ask } from './AskBar';
import type { Operation, PullListView, PullView, RefKind, RefView, WorktreeView } from '../types';

type Props = {
  session: Session | null;
  pulls: PullListView | null;
  collapsed: boolean;
  onToggle: () => void;
  currentBranch: string | null;
  checkingOut: string | null;
  onPick: (commit: number) => void;
  onCheckout: (ref: RefView) => void;
  onRun: (operation: Operation) => void;
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

function Tracking({ view }: { view: RefView }) {
  const { t } = useTranslation();
  if (view.gone) {
    return <span className="text-deleted text-2xs shrink-0">{t('sidebar.gone')}</span>;
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
  onPick,
  onCheckout,
  onMenu,
}: {
  item: Extract<FlatRef, { kind: 'ref' }>;
  checkingOut: string | null;
  onPick: (commit: number) => void;
  onCheckout: (ref: RefView) => void;
  onMenu: (ref: RefView) => void;
}) {
  const view = item.ref;
  return (
    <ListRow
      depth={item.depth}
      gutter={view.isHead ? <Icon.current className="text-ref-current size-3.5" /> : null}
      current={view.isHead}
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
      <Tracking view={view} />
    </ListRow>
  );
});

const FolderRow = memo(function FolderRow({
  item,
  onFlip,
}: {
  item: Extract<FlatRef, { kind: 'folder' }>;
  onFlip: (path: string) => void;
}) {
  const Glyph = item.open ? Icon.open : Icon.folder;
  return (
    <ListRow depth={item.depth} gutter={null} title={item.path} onClick={() => onFlip(item.path)}>
      <Glyph className="text-faint size-3.5 shrink-0" />
      <span className="text-muted-foreground min-w-0 flex-1 truncate">{item.name}</span>
    </ListRow>
  );
});

const TagRow = memo(function TagRow({
  view,
  onPick,
  onMenu,
}: {
  view: RefView;
  onPick: (commit: number) => void;
  onMenu: (ref: RefView) => void;
}) {
  return (
    <ListRow gutter={null} onClick={() => onPick(view.commit)} onContextMenu={() => onMenu(view)}>
      <Icon.tag className="text-faint size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{view.name}</span>
    </ListRow>
  );
});

const WorktreeRow = memo(function WorktreeRow({ view }: { view: WorktreeView }) {
  return (
    <ListRow
      gutter={view.isMain ? <Icon.current className="text-ref-current size-3.5" /> : null}
      current={view.isMain}
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
  onPickPull,
}: {
  pull: PullView;
  onPickPull: (pull: PullView) => void;
}) {
  return (
    <ListRow gutter={null} title={pull.title} onClick={() => onPickPull(pull)}>
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
                  ? 'bg-fill-2 text-foreground min-w-0 font-medium'
                  : 'text-muted-foreground hover:bg-fill-1 hover:text-foreground shrink-0',
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
  checkingOut,
  onPick,
  onCheckout,
  onRun,
  onCopy,
  onAsk,
  onWorktree,
  onOpenUrl,
  onPullsExpanded,
  onPickPull,
}: Props) {
  const { t } = useTranslation();
  const [view, setView] = usePref<ViewKey>('sidebar.view', 'local');
  const [filter, setFilter] = useState('');
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
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
        },
      );
    },
    [remotes, remoteNames, currentBranch, onCheckout, onRun, onCopy, onAsk, onWorktree, onOpenUrl, t],
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
    if (view === 'worktrees') return shownWorktrees.map((worktree) => ({ kind: 'worktree', worktree }));
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
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [view, needle]);

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

  const renderItem = (item: Item) => {
    switch (item.kind) {
      case 'folder':
        return <FolderRow item={item} onFlip={flipFolder} />;
      case 'ref':
        return (
          <RefRow
            item={item}
            checkingOut={checkingOut}
            onPick={onPick}
            onCheckout={onCheckout}
            onMenu={openRefMenu}
          />
        );
      case 'worktree':
        return <WorktreeRow view={item.worktree} />;
      case 'tag':
        return <TagRow view={item.ref} onPick={onPick} onMenu={openRefMenu} />;
      case 'pull':
        return <PullRow pull={item.pull} onPickPull={onPickPull} />;
    }
  };

  if (collapsed) {
    return (
      <aside className="flex w-12 shrink-0 flex-col items-center gap-1">
        <Hint text={t('sidebar.expand')} side="right">
          <button
            aria-label={t('sidebar.expand')}
            onClick={onToggle}
            className="text-muted-foreground hover:bg-fill-1 hover:text-foreground flex size-8 shrink-0 items-center justify-center rounded-md transition-colors"
          >
            <Icon.expand className="size-4" />
          </button>
        </Hint>
        <span className="h-1" />
        {VIEWS.map(({ key, title, icon }) => {
          const Glyph = Icon[icon];
          const count = counts[key];
          return (
            <Hint key={key} text={count === null ? title : `${title} · ${count}`} side="right">
              <button
                aria-label={title}
                onClick={() => {
                  pickView(key);
                  onToggle();
                }}
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-md transition-colors',
                  key === view
                    ? 'bg-fill-2 text-foreground'
                    : 'text-muted-foreground hover:bg-fill-1 hover:text-foreground',
                )}
              >
                <Glyph className="size-4" />
              </button>
            </Hint>
          );
        })}
      </aside>
    );
  }

  return (
    <aside className="flex w-68 shrink-0 flex-col">
      <div className="flex items-center gap-1 px-2.5 pb-2">
        <div className="relative min-w-0 flex-1">
          <Icon.search className="text-faint pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
          <Input
            value={filter}
            placeholder={t('sidebar.filter')}
            onChange={(e) => setFilter(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Hint text={t('sidebar.collapse')}>
          <button
            aria-label={t('sidebar.collapse')}
            onClick={onToggle}
            className="bg-fill-1 hover:bg-fill-2 text-faint hover:text-foreground flex size-8 shrink-0 items-center justify-center rounded-md transition-colors"
          >
            <Icon.collapse className="size-4" />
          </button>
        </Hint>
      </div>

      <ViewSwitch active={view} counts={counts} onPick={pickView} />

      <div
        ref={listRef}
        data-slot="sidebar-rows"
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
            {items.slice(first, last).map((item) => (
              <div key={keyOf(item)} style={{ height: ROW_PITCH }}>
                {renderItem(item)}
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
