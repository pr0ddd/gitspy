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
import { HOVER_FILL, SearchField } from '@/parts';
import type { Operation, WorkingTreeView } from '@/types';
import { PULL_CHOICES, TOOLBAR_ACTIONS, type PullMode } from '@/vocabulary';
import { Icon } from '@/icons';

type Props = {
  tree: WorkingTreeView | null;
  onRun: (operation: Operation) => void;
  onAsk: (ask: 'branch' | 'stash') => void;
  onTerminal: () => void;
  search: string;
  found: number[];
  at: number;
  onSearch: (query: string) => void;
  onStep: (delta: number) => void;
  busy: boolean;
  running: string | null;
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

export function Toolbar({
  tree,
  onRun,
  onAsk,
  onTerminal,
  search,
  found,
  at,
  onSearch,
  onStep,
  busy,
  running,
}: Props) {
  const { t } = useTranslation();
  const push = pushFor(tree);
  const [pullMode, setPullMode] = usePref<PullMode>('toolbar.pull', 'pull');

  const chosen = (operation?: Operation) =>
    operation?.kind === 'push' ? push : (operation ?? null);

  const why = (operation?: Operation) => {
    if (operation?.kind !== 'push') return t('toolbar.needsOperations');
    return tree?.remotes.length ? t('toolbar.needsOperations') : t('toolbar.noRemote');
  };

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 px-2">
      <div className="w-64" aria-hidden />
      <div className="flex flex-1 items-center justify-center gap-1">
        {TOOLBAR_ACTIONS.map(({ label, icon, operation, asks, terminal }) => {
          const Glyph = Icon[icon];
          const runnable = chosen(operation);

          if (operation?.kind === 'pull') {
            const wanted = pullOperation(pullMode);
            const spinning = running === wanted.kind;
            return (
              <span
                key={label}
                className={cn(
                  'group flex items-center rounded-md transition-colors has-[[data-state=open]]:bg-fill-1',
                  !busy && HOVER_FILL,
                )}
              >
                <Button
                  variant="action"
                  size="xs"
                  className="rounded-r-none pr-1"
                  disabled={busy}
                  onClick={() => onRun(wanted)}
                >
                  {spinning ? (
                    <Icon.waiting className="size-3.5 animate-spin" />
                  ) : (
                    <Glyph className="size-3.5" />
                  )}
                  {label}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="action"
                      size="xs"
                      reveal
                      className="rounded-l-none px-1.5 data-[state=open]:opacity-100"
                      disabled={busy}
                      aria-label={t('pull.chooseDefault')}
                    >
                      <Icon.chevron className="size-3 rotate-90" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuLabel className="text-muted-foreground max-w-56 text-xs font-normal">
                      {t('pull.chooseDefault')}
                    </DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      value={pullMode}
                      onValueChange={(next) => setPullMode(next as PullMode)}
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
            );
          }

          if (asks || terminal) {
            return (
              <Button
                key={label}
                variant="action"
                size="xs"
                disabled={busy}
                onClick={() => (terminal ? onTerminal() : onAsk(asks!))}
              >
                <Glyph className="size-3.5" />
                {label}
              </Button>
            );
          }
          const hint =
            runnable?.kind === 'pushSetUpstream' ? t('toolbar.noUpstream') : why(operation);
          const spinning = runnable !== null && running === runnable.kind;
          const primary = operation?.kind === 'push' && runnable !== null && !busy;

          const button = (
            <Button
              variant={primary ? 'default' : 'action'}
              size="xs"
              disabled={!runnable || busy}
              onClick={() => runnable && onRun(runnable)}
            >
              {spinning ? (
                <Icon.waiting className="size-3.5 animate-spin" />
              ) : (
                <Glyph className="size-3.5" />
              )}
              {label}
              {primary && tree && tree.ahead > 0 ? (
                <span className="tabular-nums opacity-85">{tree.ahead}</span>
              ) : null}
            </Button>
          );

          if (runnable && runnable.kind !== 'pushSetUpstream') {
            return <span key={label}>{button}</span>;
          }
          return (
            <Tooltip key={label}>
              <TooltipTrigger asChild>
                <span tabIndex={0}>{button}</span>
              </TooltipTrigger>
              <TooltipContent>{hint}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      <div className="flex w-64 shrink-0 items-center gap-1">
        <SearchField
          value={search}
          size="xs"
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
