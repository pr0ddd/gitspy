import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Session } from '../session';
import { GIT } from '../vocabulary';
import { Icon, type IconName } from '../icons';
import type { PullListView, PullView, RefKind, RefView } from '../types';

type Props = {
  session: Session | null;
  collapsed: boolean;
  pulls: PullListView | null;
  onPick: (commit: number) => void;
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
  planned?: boolean;
};

const fromRefs = (refs: RefView[], kind: RefKind): Entry[] =>
  refs
    .filter((r) => r.kind === kind)
    .map((r) => ({ label: r.name, commit: r.commit, isHead: r.isHead }));

export function Sidebar({
  session,
  collapsed,
  pulls,
  onPick,
  onToggle,
  onPullsExpanded,
  onPickPull,
}: Props) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const flip = (key: string) =>
    setOpen((now) => ({ ...now, [key]: !(now[key] ?? key !== 'pullRequests') }));

  const refs = session?.repo?.refs ?? [];

  const groups: Group[] = useMemo(
    () => [
      {
        key: 'local',
        title: GIT.local,
        icon: 'branch',
        entries: fromRefs(refs, 'localBranch'),
      },
      {
        key: 'remote',
        title: GIT.remote,
        icon: 'remote',
        entries: fromRefs(refs, 'remoteBranch'),
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
        <button
          onClick={onToggle}
          title={t('sidebar.expand')}
          className="hover:bg-surface-hover text-muted-foreground hover:text-foreground mb-1 flex size-9 items-center justify-center rounded-md transition-colors"
        >
          <Icon.expand className="size-4" />
        </button>

        {groups.map((group) => {
          const Glyph = Icon[group.icon];
          return (
            <button
              key={group.key}
              onClick={onToggle}
              title={`${group.title} · ${group.entries.length}`}
              className="hover:bg-surface-hover text-muted-foreground hover:text-foreground flex h-9 w-9 flex-col items-center justify-center gap-0.5 rounded-md transition-colors"
            >
              <Glyph className="size-3.5" />
              <span className="text-2xs tabular-nums">{group.entries.length}</span>
            </button>
          );
        })}
      </aside>
    );
  }

  return (
    <aside className="bg-card border-border flex w-64 shrink-0 flex-col border-r">
      <div className="flex items-center gap-1 p-2 pb-0">
        <button
          onClick={onToggle}
          title={t('sidebar.collapse')}
          className="hover:bg-surface-hover text-muted-foreground hover:text-foreground flex size-7 shrink-0 items-center justify-center rounded-md transition-colors"
        >
          <Icon.collapse className="size-4" />
        </button>
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

          return (
            <Section
              key={group.key}
              title={group.title}
              icon={group.icon}
              count={group.entries.length}
              open={open[group.key] ?? true}
              onToggle={() => flip(group.key)}
            >
              {shown.map((entry) => {
                const Glyph = Icon[group.icon];
                return (
                  <button
                    key={`${group.key}:${entry.label}`}
                    onClick={() => entry.commit !== null && onPick(entry.commit)}
                    title={entry.detail ?? entry.label}
                    className={cn(
                      'hover:bg-surface-hover flex h-6 w-full items-center gap-1.5 border-l-2 border-transparent pr-2 pl-6 text-left transition-colors',
                      entry.isHead && 'border-l-primary text-foreground font-medium',
                    )}
                  >
                    <Glyph className="text-muted-foreground/70 size-3 shrink-0" />
                    <span className="truncate">{entry.label}</span>
                    {entry.detail ? (
                      <span className="text-muted-foreground truncate text-xs">{entry.detail}</span>
                    ) : null}
                  </button>
                );
              })}
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
        <ChevronRight className={cn('size-3 shrink-0 transition-transform', open && 'rotate-90')} />
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
    <button
      onClick={() => onPickPull(pull)}
      title={pull.title}
      className="hover:bg-surface-hover flex h-6 w-full items-center gap-1.5 pr-2 pl-6 text-left transition-colors"
    >
      <span className="text-muted-foreground/70 shrink-0 font-mono text-xs">#{pull.number}</span>
      <span className="truncate text-xs">{pull.title}</span>
    </button>
  );
}
