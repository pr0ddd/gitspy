import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Search } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { Session } from '../session';
import { GIT } from '../vocabulary';
import type { RefKind, RefView } from '../types';

type Props = {
  session: Session | null;
  onPick: (commit: number) => void;
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
  entries: Entry[];
  planned?: boolean;
};

const fromRefs = (refs: RefView[], kind: RefKind): Entry[] =>
  refs
    .filter((r) => r.kind === kind)
    .map((r) => ({ label: r.name, commit: r.commit, isHead: r.is_head }));

export function Sidebar({ session, onPick }: Props) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState('');

  const refs = session?.layout?.refs ?? [];

  const groups: Group[] = useMemo(
    () => [
      { key: 'local', title: GIT.local, entries: fromRefs(refs, 'localBranch') },
      { key: 'remote', title: GIT.remote, entries: fromRefs(refs, 'remoteBranch') },
      {
        key: 'worktrees',
        title: GIT.worktrees,
        entries: (session?.worktrees ?? []).map((w) => ({
          label: w.name,
          detail: w.branch ?? undefined,
          commit: null,
          isHead: w.is_main,
        })),
      },
      { key: 'stashes', title: GIT.stashes, entries: fromRefs(refs, 'stash') },
      { key: 'tags', title: GIT.tags, entries: fromRefs(refs, 'tag') },
      { key: 'pullRequests', title: GIT.pullRequests, entries: [], planned: true },
      { key: 'issues', title: GIT.issues, entries: [], planned: true },
    ],
    [refs, session?.worktrees],
  );

  const needle = filter.trim().toLowerCase();

  return (
    <aside className="bg-card border-border flex w-64 shrink-0 flex-col border-r">
      <div className="relative p-2">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-3 -translate-y-1/2" />
        <Input
          value={filter}
          placeholder={t('sidebar.filter')}
          onChange={(e) => setFilter(e.target.value)}
          className="h-7 pl-7 text-xs"
        />
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {groups.map((group) => {
          const shown = needle
            ? group.entries.filter((e) => e.label.toLowerCase().includes(needle))
            : group.entries;

          return (
            <Collapsible key={group.key} defaultOpen className="group/section">
              <CollapsibleTrigger
                title={group.planned ? t('sidebar.plannedHint') : undefined}
                className={cn(
                  'hover:bg-surface-hover flex h-7 w-full items-center gap-1.5 px-2 text-xs tracking-wide uppercase transition-colors',
                  group.planned ? 'text-muted-foreground/60' : 'text-muted-foreground',
                )}
              >
                <ChevronRight className="size-3 transition-transform group-data-[state=open]/section:rotate-90" />
                <span className="flex-1 text-left">{group.title}</span>
                <span className="text-muted-foreground/70 tabular-nums">
                  {group.entries.length}
                </span>
              </CollapsibleTrigger>

              <CollapsibleContent className="data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden">
                {shown.map((entry) => (
                  <button
                    key={`${group.key}:${entry.label}`}
                    onClick={() => entry.commit !== null && onPick(entry.commit)}
                    title={entry.detail ?? entry.label}
                    className={cn(
                      'hover:bg-surface-hover flex h-6 w-full items-center gap-1.5 border-l-2 border-transparent pr-2 pl-6 text-left transition-colors',
                      entry.isHead && 'border-l-primary text-foreground font-medium',
                    )}
                  >
                    <span className="truncate">{entry.label}</span>
                    {entry.detail ? (
                      <span className="text-muted-foreground truncate text-xs">
                        {entry.detail}
                      </span>
                    ) : null}
                  </button>
                ))}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </ScrollArea>
    </aside>
  );
}
