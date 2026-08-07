import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { usePref } from '@/prefs';
import { useRepoWork } from '@/features/repo';
import { SearchField } from '@/parts';
import type { Operation, WorkingTreeView } from '@/types';
import { GIT, PULL_CHOICES, TOOLBAR_ACTIONS, type PullMode } from '@/vocabulary';
import { Icon } from '@/icons';

type Props = {
  repo: string;
  tree: WorkingTreeView | null;
  onRun: (operation: Operation) => void;
  onAsk: (ask: 'branch' | 'stash') => void;
  onTerminal: () => void;
  search: string;
  found: number[];
  at: number;
  onSearch: (query: string) => void;
  onStep: (delta: number) => void;
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
      {GIT.push}
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
        <Button
          variant="split"
          size="sm-lead"
          disabled={busy}
          onClick={() => onRun(wanted)}
        >
          <Icon.pull className={cn('size-4', pulling && 'animate-dive')} />
          {GIT.pull}
          <Tally count={behind} tone="behind" />
        </Button>
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
        pushButton
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
  onSearch,
  onStep,
}: Props) {
  const { t } = useTranslation();
  const work = useRepoWork(repo);
  const busy = work !== null;
  const running = work?.kind ?? null;
  const push = pushFor(tree);
  const [pullMode, setPullMode] = usePref<PullMode>('toolbar.pull', 'pull');

  return (
    <div className="flex h-10 shrink-0 items-center gap-2 px-2">
      <div className="w-64" aria-hidden />
      <div className="flex min-w-0 flex-1 items-center justify-center">
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
              <Button
                key={label}
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
                {label}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="flex w-64 shrink-0 items-center gap-1">
        <SearchField
          value={search}
          placeholder={t('search.placeholder')}
          onChange={onSearch}
          onKeyDown={(e) => e.key === 'Enter' && onStep(e.shiftKey ? -1 : 1)}
        />

        {search.trim() ? (
          <>
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {found.length ? `${at + 1}/${found.length}` : t('search.none')}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 shrink-0"
              disabled={!found.length}
              onClick={() => onStep(-1)}
            >
              <Icon.up className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 shrink-0"
              disabled={!found.length}
              onClick={() => onStep(1)}
            >
              <Icon.down className="size-3" />
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
