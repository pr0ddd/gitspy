import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Hint, Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import { cn } from '@/shared/lib/utils';
import { usePref } from '@/shared/lib/prefs';
import { useRepoWork } from '@/features/repo';
import { SearchField } from '@/shared/ui/parts';
import type { Operation, WorkingTreeView } from '@/shared/api/types';
import { GIT, PULL_CHOICES, TOOLBAR_ACTIONS, type PullMode } from '@/shared/config/vocabulary';
import { Icon } from '@/shared/ui/icons';
import { useFoundCommits } from '@/features/search';
import { SearchResults } from './SearchResults';

type Props = {
  repo: string;
  tree: WorkingTreeView | null;
  onRun: (operation: Operation) => void;
  onAsk: (ask: 'branch' | 'stash') => void;
  onTerminal: () => void;
  search: string;
  found: number[];
  at: number;
  focusAt: number;
  onSearch: (query: string) => void;
  onStep: (delta: number) => void;
  onPickFound: (index: number) => void;
  start?: React.ReactNode;
};

export const pushFor = (tree: WorkingTreeView | null): Operation | null => {
  if (!tree?.branch) return null;
  if (tree.upstream) return { kind: 'push' };

  const [remote] = tree.remotes;
  if (!remote) return null;
  return { kind: 'pushSetUpstream', remote, branch: tree.branch };
};

const pullOperation = (mode: PullMode): Operation =>
  mode === 'fetch' ? { kind: 'fetch' } : { kind: mode };

function Label({ children }: { children: React.ReactNode }) {
  return <span className="@6xl:inline hidden">{children}</span>;
}

function Tally({ count, tone }: { count: number; tone: 'ahead' | 'behind' }) {
  if (count === 0) return null;
  return (
    <span className={cn('text-2xs tabular-nums', tone === 'ahead' ? 'opacity-85' : 'text-behind')}>
      {count}
    </span>
  );
}

function ExchangeDeck({
  tree,
  push,
  busy,
  running,
  pullMode,
  onPullMode,
  onRun,
}: {
  tree: WorkingTreeView | null;
  push: Operation | null;
  busy: boolean;
  running: string | null;
  pullMode: PullMode;
  onPullMode: (next: PullMode) => void;
  onRun: (operation: Operation) => void;
}) {
  const { t } = useTranslation();
  const wanted = pullOperation(pullMode);
  const ahead = tree?.ahead ?? 0;
  const behind = tree?.behind ?? 0;
  const charged = push !== null && ahead > 0 && !busy;
  const pushHint = tree?.remotes.length ? t('toolbar.noUpstream') : t('toolbar.noRemote');

  const pushing = push !== null && running === push.kind;
  const pulling = running === wanted.kind;

  const pushButton = (
    <Button
      variant={charged ? 'default' : 'action'}
      size="sm"
      disabled={!push || busy}
      onClick={() => push && onRun(push)}
    >
      <Icon.push className={cn('size-4', pushing && 'animate-lift')} />
      <Label>{GIT.push}</Label>
      <Tally count={ahead} tone="ahead" />
    </Button>
  );

  return (
    <>
      <span
        className={cn(
          'group/split has-[[data-state=open]]:bg-fill-1 flex items-center rounded-md transition-colors',
          !busy && 'hover:bg-hover-fill',
        )}
      >
        <Hint text={GIT.pull}>
          <Button variant="split" size="sm-lead" disabled={busy} onClick={() => onRun(wanted)}>
            <Icon.pull className={cn('size-4', pulling && 'animate-dive')} />
            <Label>{GIT.pull}</Label>
            <Tally count={behind} tone="behind" />
          </Button>
        </Hint>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="split"
              size="sm-tail"
              disabled={busy}
              aria-label={t('pull.chooseDefault')}
            >
              <Icon.chevron className="size-3.5 rotate-90" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel className="text-muted-foreground max-w-56 text-xs font-normal">
              {t('pull.chooseDefault')}
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={pullMode}
              onValueChange={(next) => onPullMode(next as PullMode)}
            >
              {PULL_CHOICES.map(({ mode, label: choice }) => (
                <DropdownMenuRadioItem key={mode} value={mode}>
                  {t(choice as 'pull.default')}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </span>

      {push ? (
        <Hint text={GIT.push}>{pushButton}</Hint>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0}>{pushButton}</span>
          </TooltipTrigger>
          <TooltipContent>{pushHint}</TooltipContent>
        </Tooltip>
      )}
    </>
  );
}

export function Toolbar({
  repo,
  tree,
  onRun,
  onAsk,
  onTerminal,
  search,
  found,
  at,
  focusAt,
  onSearch,
  onStep,
  onPickFound,
  start,
}: Props) {
  const { t } = useTranslation();
  const work = useRepoWork(repo);
  const busy = work !== null;
  const running = work?.kind ?? null;
  const push = pushFor(tree);
  const [pullMode, setPullMode] = usePref<PullMode>('toolbar.pull', 'pull');
  const field = useRef<HTMLInputElement>(null);
  const [listing, setListing] = useState(false);
  const preview = useFoundCommits(repo, found);

  useEffect(() => {
    if (focusAt > 0) field.current?.select();
  }, [focusAt]);

  useEffect(() => {
    if (!search.trim()) setListing(false);
  }, [search]);

  return (
    <div className="@container grid h-12 shrink-0 grid-cols-toolbar items-center gap-2 px-2">
      <div className="flex min-w-0 items-center">{start}</div>
      <div className="flex min-w-0 items-center justify-center">
        <div className="bg-control-fill flex items-center gap-0.5 rounded-lg p-0.5">
          <ExchangeDeck
            tree={tree}
            push={push}
            busy={busy}
            running={running}
            pullMode={pullMode}
            onPullMode={setPullMode}
            onRun={onRun}
          />

          {TOOLBAR_ACTIONS.map(({ label, icon, operation, asks, terminal }) => {
            const Glyph = Icon[icon];
            const spinning = operation !== undefined && running === operation.kind;
            return (
              <Hint key={label} text={label}>
                <Button
                  variant="action"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    terminal ? onTerminal() : asks ? onAsk(asks) : operation && onRun(operation)
                  }
                >
                  {spinning ? (
                    <Icon.waiting className="size-4 animate-spin" />
                  ) : (
                    <Glyph className="size-4" />
                  )}
                  <Label>{label}</Label>
                </Button>
              </Hint>
            );
          })}
        </div>
      </div>

      <div className="flex min-w-0 items-center justify-end">
        <div className="relative flex w-full max-w-64 items-center">
          <SearchField
            value={search}
            fieldRef={field}
            placeholder={t('search.placeholder')}
            onChange={(text) => {
              setListing(true);
              onSearch(text);
            }}
            onFocus={() => setListing(true)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setListing(false);
              if (e.key === 'Enter') onStep(e.shiftKey ? -1 : 1);
            }}
            trailing={
              search.trim() ? (
                <>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {found.length ? `${at + 1}/${found.length}` : t('search.none')}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t('search.previous')}
                    disabled={!found.length}
                    onClick={() => onStep(-1)}
                  >
                    <Icon.up />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t('search.next')}
                    disabled={!found.length}
                    onClick={() => onStep(1)}
                  >
                    <Icon.down />
                  </Button>
                </>
              ) : null
            }
          />
          {listing && preview.length > 0 ? (
            <SearchResults
              commits={preview}
              total={found.length}
              at={found[at] ?? -1}
              onPick={(index) => {
                setListing(false);
                onPickFound(index);
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
