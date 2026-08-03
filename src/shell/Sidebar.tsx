import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Hint, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { Session } from '../session';
import { GIT } from '../vocabulary';
import { Icon, type IconName } from '../icons';
import { buildRefTree, filterRefTree, type TreeNode } from '../refTree';
import type { PullListView, PullView, RefKind, RefView } from '../types';

type Props = {
  session: Session | null;
  collapsed: boolean;
  pulls: PullListView | null;
  onPick: (commit: number) => void;
  onCheckout: (ref: RefView) => void;
  onToggle: () => void;
  onPullsExpanded: () => void;
  onPickPull: (pull: PullView) => void;
};

type Entry = {
  label: string;
  detail?: string;
  commit: number | null;
  isHead: boolean;
};

type Group = {
  key: string;
  title: string;
  icon: IconName;
  entries: Entry[];
  tree?: TreeNode[];
};

const fromRefs = (refs: RefView[], kind: RefKind): Entry[] =>
  refs
    .filter((r) => r.kind === kind)
    .map((r) => ({ label: r.name, commit: r.commit, isHead: r.isHead }));

const treeOf = (refs: RefView[], kind: RefKind): TreeNode[] =>
  buildRefTree(refs.filter((r) => r.kind === kind));

const CAP = 99;
const INDENT = ['pl-3', 'pl-6', 'pl-9', 'pl-12', 'pl-16', 'pl-20'] as const;

const indentAt = (depth: number) => INDENT[Math.min(depth, INDENT.length - 1)];

function Tracking({ view }: { view: RefView }) {
  if (view.gone) {
    return <Icon.detached className="text-destructive size-3 shrink-0" />;
  }
  if (!view.ahead && !view.behind) return null;

  const shown = (count: number) => (count > CAP ? `${CAP}+` : `${count}`);

  return (
    <span className="text-2xs flex shrink-0 items-center gap-1 tabular-nums">
      {view.ahead ? (
        <span className="text-ahead flex items-center">
          {shown(view.ahead)}
          <Icon.up className="size-3" />
        </span>
      ) : null}
      {view.behind ? (
        <span className="text-behind flex items-center">
          {shown(view.behind)}
          <Icon.down className="size-3" />
        </span>
      ) : null}
    </span>
  );
}

type RowProps = {
  depth?: number;
  leading?: React.ReactNode;
  icon: IconName;
  iconClass?: string;
  badge?: React.ReactNode;
  label: string;
  detail?: string;
  hint?: string;
  trailing?: React.ReactNode;
  current?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
};

function Row({
  depth = 0,
  leading,
  icon,
  iconClass,
  badge,
  label,
  detail,
  hint,
  trailing,
  current,
  onClick,
  onDoubleClick,
}: RowProps) {
  const Glyph = Icon[icon];
  const button = (
    <button
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={cn(
        'hover:bg-surface-hover flex h-6 w-full items-center gap-1.5 pr-2 text-left text-xs transition-colors',
        indentAt(depth),
        current && 'bg-ahead/15 font-medium',
      )}
    >
      {leading}
      <Glyph className={cn('size-3 shrink-0', iconClass ?? 'text-muted-foreground/70')} />
      {badge}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {detail ? <span className="text-muted-foreground shrink-0 truncate">{detail}</span> : null}
      {trailing}
    </button>
  );

  if (!hint) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{hint}</TooltipContent>
    </Tooltip>
  );
}

const EVERYTHING_OPEN: ReadonlySet<string> = new Set();

type BranchesProps = {
  nodes: TreeNode[];
  depth: number;
  closed: ReadonlySet<string>;
  onFlip: (path: string) => void;
  onPick: (commit: number) => void;
  onCheckout: (ref: RefView) => void;
};

function Branches({ nodes, depth, closed, onFlip, onPick, onCheckout }: BranchesProps) {
  return (
    <>
      {nodes.map((node) =>
        node.kind === 'folder' ? (
          <div key={node.path}>
            <Row
              depth={depth}
              icon="folder"
              label={node.name}
              onClick={() => onFlip(node.path)}
              leading={
                <Icon.chevron
                  className={cn(
                    'size-3 shrink-0 transition-transform',
                    !closed.has(node.path) && 'rotate-90',
                  )}
                />
              }
            />
            {closed.has(node.path) ? null : (
              <Branches
                nodes={node.children}
                depth={depth + 1}
                closed={closed}
                onFlip={onFlip}
                onPick={onPick}
                onCheckout={onCheckout}
              />
            )}
          </div>
        ) : (
          <Row
            key={node.path}
            depth={depth + 1}
            icon={node.ref.isHead ? 'current' : 'branch'}
            iconClass={node.ref.isHead ? 'text-ahead' : undefined}
            label={node.name}
            hint={node.path === node.name ? undefined : node.path}
            trailing={<Tracking view={node.ref} />}
            current={node.ref.isHead}
            onClick={() => onPick(node.ref.commit)}
            onDoubleClick={() => onCheckout(node.ref)}
          />
        ),
      )}
    </>
  );
}

export function Sidebar({
  session,
  collapsed,
  pulls,
  onPick,
  onCheckout,
  onToggle,
  onPullsExpanded,
  onPickPull,
}: Props) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const flip = (key: string) =>
    setOpen((now) => ({
      ...now,
      [key]: !(now[key] ?? key !== 'pullRequests'),
    }));
  const flipFolder = (path: string) =>
    setClosed((now) => {
      const next = new Set(now);
      if (!next.delete(path)) next.add(path);
      return next;
    });

  const refs = session?.repo?.refs ?? [];

  const groups: Group[] = useMemo(
    () => [
      {
        key: 'local',
        title: GIT.local,
        icon: 'branch',
        entries: fromRefs(refs, 'localBranch'),
        tree: treeOf(refs, 'localBranch'),
      },
      {
        key: 'remote',
        title: GIT.remote,
        icon: 'remote',
        entries: fromRefs(refs, 'remoteBranch'),
        tree: treeOf(refs, 'remoteBranch'),
      },
      {
        key: 'worktrees',
        title: GIT.worktrees,
        icon: 'worktree',
        entries: (session?.worktrees ?? []).map((w) => ({
          label: w.name,
          detail: w.branch ?? undefined,
          commit: null,
          isHead: w.isMain,
        })),
      },
      {
        key: 'stashes',
        title: GIT.stashes,
        icon: 'stash',
        entries: fromRefs(refs, 'stash'),
      },
      {
        key: 'tags',
        title: GIT.tags,
        icon: 'tag',
        entries: fromRefs(refs, 'tag'),
      },
    ],
    [refs, session?.worktrees],
  );

  const needle = filter.trim().toLowerCase();

  if (collapsed) {
    return (
      <aside className="bg-card border-border flex w-11 shrink-0 flex-col items-center gap-1 border-r py-2">
        <Hint text={t('sidebar.expand')}>
          <button
            onClick={onToggle}
            className="hover:bg-surface-hover text-muted-foreground hover:text-foreground mb-1 flex size-9 items-center justify-center rounded-md transition-colors"
          >
            <Icon.expand className="size-4" />
          </button>
        </Hint>

        {groups.map((group) => {
          const Glyph = Icon[group.icon];
          return (
            <Hint key={group.key} text={`${group.title} · ${group.entries.length}`}>
              <button
                onClick={onToggle}
                className="hover:bg-surface-hover text-muted-foreground hover:text-foreground flex h-9 w-9 flex-col items-center justify-center gap-0.5 rounded-md transition-colors"
              >
                <Glyph className="size-3.5" />
                <span className="text-2xs tabular-nums">{group.entries.length}</span>
              </button>
            </Hint>
          );
        })}
      </aside>
    );
  }

  return (
    <aside className="bg-card border-border flex w-64 shrink-0 flex-col border-r">
      <div className="flex items-center gap-1 p-2 pb-0">
        <Hint text={t('sidebar.collapse')}>
          <button
            onClick={onToggle}
            className="hover:bg-surface-hover text-muted-foreground hover:text-foreground flex size-7 shrink-0 items-center justify-center rounded-md transition-colors"
          >
            <Icon.collapse className="size-4" />
          </button>
        </Hint>
        <span className="text-muted-foreground truncate text-xs">{session?.name ?? ''}</span>
      </div>

      <div className="relative p-2">
        <Icon.search className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-3 -translate-y-1/2" />
        <Input
          value={filter}
          placeholder={t('sidebar.filter')}
          onChange={(e) => setFilter(e.target.value)}
          className="h-7 pl-7 text-xs"
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {groups.map((group) => {
          const shown = needle
            ? group.entries.filter((e) => e.label.toLowerCase().includes(needle))
            : group.entries;

          if (group.tree) {
            const matching = filterRefTree(group.tree, needle);

            return (
              <Section
                title={group.title}
                key={group.key}
                icon={group.icon}
                count={group.entries.length}
                open={open[group.key] ?? true}
                onToggle={() => flip(group.key)}
              >
                <Branches
                  nodes={matching}
                  depth={0}
                  closed={needle ? EVERYTHING_OPEN : closed}
                  onFlip={flipFolder}
                  onPick={onPick}
                  onCheckout={onCheckout}
                />
              </Section>
            );
          }

          return (
            <Section
              title={group.title}
              key={group.key}
              icon={group.icon}
              count={group.entries.length}
              open={open[group.key] ?? true}
              onToggle={() => flip(group.key)}
            >
              {shown.map((entry) => (
                <Row
                  key={`${group.key}:${entry.label}`}
                  depth={1}
                  icon={group.icon}
                  label={entry.label}
                  detail={entry.detail}
                  current={entry.isHead}
                  onClick={() => entry.commit !== null && onPick(entry.commit)}
                />
              ))}
            </Section>
          );
        })}

        <Section
          title={GIT.pullRequests}
          icon="pullRequest"
          count={pulls?.pulls.length ?? null}
          open={open.pullRequests ?? false}
          onToggle={() => {
            if (!(open.pullRequests ?? false)) onPullsExpanded();
            flip('pullRequests');
          }}
        >
          {pulls === null ? (
            <p className="text-muted-foreground/60 flex h-6 items-center gap-1.5 pl-6 text-xs">
              <Icon.waiting className="size-3 animate-spin" />
              {t('host.loading')}
            </p>
          ) : (
            <>
              <PullGroup
                title={t('pull.mine')}
                pulls={pulls.pulls.filter((p) => p.mine)}
                onPickPull={onPickPull}
              />
              <PullGroup
                title={t('pull.assignedToMe')}
                pulls={pulls.pulls.filter((p) => p.assignedToMe)}
                onPickPull={onPickPull}
              />
              <PullGroup
                title={t('pull.awaitingMyReview')}
                pulls={pulls.pulls.filter((p) => p.awaitingMyReview)}
                onPickPull={onPickPull}
              />
              {pulls.pulls
                .filter((p) => !p.mine && !p.assignedToMe && !p.awaitingMyReview)
                .map((pull) => (
                  <PullItem key={pull.number} pull={pull} onPickPull={onPickPull} />
                ))}
              {pulls.truncated ? (
                <p className="text-muted-foreground/60 flex h-6 items-center pl-6 text-xs">
                  {t('pull.truncated', { count: pulls.pulls.length })}
                </p>
              ) : null}
              {pulls.pulls.length === 0 ? (
                <p className="text-muted-foreground/60 flex h-6 items-center pl-6 text-xs">
                  {t('pull.empty')}
                </p>
              ) : null}
            </>
          )}
        </Section>
      </div>
    </aside>
  );
}

type SectionProps = {
  title: string;
  icon: IconName;
  count: number | null;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
};

function Section({ title, icon, count, open, onToggle, children }: SectionProps) {
  const Glyph = Icon[icon];
  return (
    <section className={cn('flex flex-col', open ? 'min-h-24 flex-1 basis-0' : 'shrink-0')}>
      <button
        onClick={onToggle}
        className="border-border/50 hover:bg-surface-hover flex h-7 w-full shrink-0 items-center gap-1.5 border-t px-2 text-xs tracking-wide uppercase transition-colors"
      >
        <Icon.chevron className={cn('size-3 shrink-0 transition-transform', open && 'rotate-90')} />
        <Glyph className="text-muted-foreground size-3.5 shrink-0" />
        <span className="text-muted-foreground min-w-0 flex-1 truncate text-left">{title}</span>
        <span className="text-muted-foreground/70 shrink-0 tabular-nums">{count ?? ''}</span>
      </button>
      {open ? <div className="min-h-0 flex-1 overflow-y-auto">{children}</div> : null}
    </section>
  );
}

type PullGroupProps = {
  title: string;
  pulls: PullView[];
  onPickPull: (pull: PullView) => void;
};

function PullGroup({ title, pulls, onPickPull }: PullGroupProps) {
  if (!pulls.length) return null;
  return (
    <div>
      <p className="text-muted-foreground/70 flex h-6 items-center justify-between pr-2 pl-6 text-2xs tracking-wide uppercase">
        {title}
        <span className="tabular-nums">{pulls.length}</span>
      </p>
      {pulls.map((pull) => (
        <PullItem key={pull.number} pull={pull} onPickPull={onPickPull} />
      ))}
    </div>
  );
}

function PullItem({ pull, onPickPull }: { pull: PullView; onPickPull: (pull: PullView) => void }) {
  return (
    <Row
      depth={1}
      icon="pullRequest"
      badge={<span className="text-muted-foreground/70 shrink-0 font-mono">#{pull.number}</span>}
      label={pull.title}
      hint={pull.title}
      onClick={() => onPickPull(pull)}
    />
  );
}
