import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { Session } from '../session';
import type { Operation, WorkingTreeView } from '../types';
import { GIT, TOOLBAR_ACTIONS } from '../vocabulary';
import { Icon } from '../icons';

type Props = {
  session: Session | null;
  sessions: Session[];
  tree: WorkingTreeView | null;
  onRun: (operation: Operation) => void;
  onActivate: (path: string) => void;
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

function Selector({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="hover:bg-fill-1 flex min-w-0 flex-col rounded-md px-2 py-0.5 text-left transition-colors">
          <span className="text-faint text-2xs">{label}</span>
          <span className="flex items-center gap-1">
            <span className="max-w-40 truncate text-sm font-medium">{value}</span>
            <Icon.more className="text-muted-foreground size-3 shrink-0" />
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-64 overflow-y-auto">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Toolbar({
  session,
  sessions,
  tree,
  onRun,
  onActivate,
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
  const head = session?.repo?.refs.find((r) => r.isHead);
  const push = pushFor(tree);

  const branches = (session?.repo?.refs ?? []).filter(
    (ref) => ref.kind === 'localBranch' || ref.kind === 'remoteBranch',
  );

  const chosen = (operation?: Operation) =>
    operation?.kind === 'push' ? push : (operation ?? null);

  const why = (operation?: Operation) => {
    if (operation?.kind !== 'push') return t('toolbar.needsOperations');
    return tree?.remotes.length ? t('toolbar.needsOperations') : t('toolbar.noRemote');
  };

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 px-3">
      <div className="flex min-w-0 shrink-0 items-center gap-1">
        <Selector label={t('toolbar.repositoryLabel')} value={session?.name ?? '—'}>
          <DropdownMenuLabel className="text-2xs">
            {t('toolbar.openRepositories')}
          </DropdownMenuLabel>
          {sessions.map((open) => (
            <DropdownMenuItem key={open.path} onSelect={() => onActivate(open.path)}>
              <Icon.branch className="size-3.5" />
              <span className="truncate">{open.name}</span>
            </DropdownMenuItem>
          ))}
        </Selector>

        <Selector label={t('toolbar.branchLabel')} value={head?.name ?? '—'}>
          <DropdownMenuLabel className="text-2xs">{GIT.local}</DropdownMenuLabel>
          {branches.map((ref) => (
            <DropdownMenuItem
              key={`${ref.kind}:${ref.name}`}
              onSelect={() => onRun({ kind: 'checkout', branch: ref.name })}
            >
              <Icon.branch
                className={cn('size-3.5', ref.kind === 'remoteBranch' && 'text-muted-foreground')}
              />
              <span className="truncate">{ref.name}</span>
              {ref.isHead ? <span className="text-primary ml-auto text-xs">✓</span> : null}
            </DropdownMenuItem>
          ))}
        </Selector>

        {tree && (tree.ahead > 0 || tree.behind > 0) ? (
          <span className="flex shrink-0 items-center gap-1.5 px-1 text-xs tabular-nums">
            <span
              className={cn(
                'flex items-center gap-0.5',
                tree.ahead ? 'text-ahead' : 'text-muted-foreground',
              )}
            >
              <Icon.push className="size-3" />
              {tree.ahead}
            </span>
            <span
              className={cn(
                'flex items-center gap-0.5',
                tree.behind ? 'text-behind' : 'text-muted-foreground',
              )}
            >
              <Icon.pull className="size-3" />
              {tree.behind}
            </span>
          </span>
        ) : null}
      </div>

      <Separator orientation="vertical" className="h-6" />

      <div className="flex flex-1 items-center justify-center gap-1">
        {TOOLBAR_ACTIONS.map(({ label, icon, operation, asks, terminal }) => {
          const Glyph = Icon[icon];
          const runnable = chosen(operation);

          if (asks || terminal) {
            return (
              <Button
                key={label}
                variant="ghost"
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
              variant={primary ? 'default' : 'ghost'}
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
        <div className="relative min-w-0 flex-1">
          <Icon.search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onStep(e.shiftKey ? -1 : 1)}
            placeholder={t('search.placeholder')}
            className="h-7 pl-7 text-xs"
          />
        </div>

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
