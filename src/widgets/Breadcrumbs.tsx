import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import { Icon } from '@/shared/ui/icons';
import { InlineNote, ListRow, SearchField, SectionHeader } from '@/shared/ui/parts';
import { branchChoices, repoMenu, type BranchChoice, type RepoChoice } from '@/entities/repo';
import type { RecentRepo, RefView, WorktreeView } from '@/shared/api/types';

type Props = {
  repoPath: string;
  repoName: string;
  openPaths: readonly string[];
  recent: readonly RecentRepo[];
  refs: readonly RefView[];
  worktrees: readonly WorktreeView[];
  currentBranch: string | null;
  onOpenPath: (path: string) => void;
  onStart: () => void;
  onCheckout: (ref: RefView) => void;
  onReveal: (commit: number) => void;
};

function useTruncated(label: string): [(span: HTMLSpanElement | null) => void, boolean] {
  const span = useRef<HTMLSpanElement | null>(null);
  const watching = useRef<ResizeObserver | null>(null);
  const [truncated, setTruncated] = useState(false);
  const measure = () => {
    const el = span.current;
    if (el) setTruncated(el.scrollWidth > el.clientWidth + 1);
  };
  const attach = useCallback((el: HTMLSpanElement | null) => {
    watching.current?.disconnect();
    watching.current = null;
    span.current = el;
    if (!el) return;
    setTruncated(el.scrollWidth > el.clientWidth + 1);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      setTruncated(el.scrollWidth > el.clientWidth + 1);
    });
    observer.observe(el);
    watching.current = observer;
  }, []);
  useLayoutEffect(measure, [label]);
  return [attach, truncated];
}

function Crumb({
  caption,
  label,
  open,
  onOpenChange,
  className,
  children,
}: {
  caption: string;
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className: string;
  children: React.ReactNode;
}) {
  const [labelRef, truncated] = useTruncated(label);
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="action" size="crumb" className={className}>
              <span className="text-muted-foreground text-xs leading-4 whitespace-nowrap">
                {caption}
              </span>
              <span className="flex max-w-full min-w-0 items-center gap-2 leading-5">
                <span ref={labelRef} className="text-foreground min-w-0 truncate font-semibold">
                  {label}
                </span>
                <Icon.chevron className="text-muted-foreground shrink-0 rotate-90" />
              </span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        {truncated && !open ? <TooltipContent side="bottom">{label}</TooltipContent> : null}
      </Tooltip>
      <PopoverContent align="start" className="w-72 p-1">
        {children}
      </PopoverContent>
    </Popover>
  );
}

function CrumbArrow() {
  return (
    <span className="flex h-10 shrink-0 flex-col justify-center px-1">
      <span className="text-xs leading-4">&nbsp;</span>
      <Icon.chevron className="text-muted-foreground size-4 leading-5" />
    </span>
  );
}

function RepoRow({ repo, onPick }: { repo: RepoChoice; onPick: () => void }) {
  return (
    <ListRow title={repo.path} onClick={onPick}>
      <Icon.folder className="text-muted-foreground size-3 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{repo.name}</span>
      {repo.open ? <Icon.current className="text-ref-current size-3 shrink-0" /> : null}
    </ListRow>
  );
}

function BranchRow({ choice, onPick }: { choice: BranchChoice; onPick: () => void }) {
  const Glyph = choice.worktree ? Icon.worktree : Icon.branch;
  return (
    <ListRow
      title={choice.worktree?.path ?? choice.ref.name}
      current={choice.current}
      onClick={onPick}
    >
      <Glyph className="text-muted-foreground size-3 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{choice.ref.name}</span>
      {choice.current ? <Icon.current className="text-ref-current size-3 shrink-0" /> : null}
    </ListRow>
  );
}

export function Breadcrumbs({
  repoPath,
  repoName,
  openPaths,
  recent,
  refs,
  worktrees,
  currentBranch,
  onOpenPath,
  onStart,
  onCheckout,
  onReveal,
}: Props) {
  const { t } = useTranslation();
  const [openCrumb, setOpenCrumb] = useState<'repo' | 'branch' | null>(null);
  const [repoFilter, setRepoFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');

  const show = (crumb: 'repo' | 'branch', open: boolean) => {
    setOpenCrumb(open ? crumb : null);
    setRepoFilter('');
    setBranchFilter('');
  };

  const repos = repoMenu(openPaths, recent, repoPath, repoFilter);
  const branches = branchChoices(refs, worktrees, currentBranch, branchFilter);

  const pickRepo = (path: string) => {
    setOpenCrumb(null);
    onOpenPath(path);
  };

  const pickBranch = (choice: BranchChoice) => {
    setOpenCrumb(null);
    if (choice.worktree) {
      onOpenPath(choice.worktree.path);
      return;
    }
    onReveal(choice.ref.commit);
    if (!choice.current) onCheckout(choice.ref);
  };

  return (
    <div className="flex min-w-0 items-center">
      <Crumb
        caption={t('breadcrumb.repository')}
        label={repoName}
        open={openCrumb === 'repo'}
        onOpenChange={(open) => show('repo', open)}
        className="max-w-40 shrink-0"
      >
        <div className="flex flex-col gap-1">
          <div className="flex px-1 pt-1">
            <SearchField
              value={repoFilter}
              size="xs"
              placeholder={t('start.searchRepos')}
              onChange={setRepoFilter}
            />
          </div>
          <div className="max-h-80 overflow-y-auto">
            {repos.searching ? (
              repos.found.length > 0 ? (
                repos.found.map((repo) => (
                  <RepoRow key={repo.path} repo={repo} onPick={() => pickRepo(repo.path)} />
                ))
              ) : (
                <InlineNote>{t('breadcrumb.nothing')}</InlineNote>
              )
            ) : (
              <>
                {repos.favorites.length > 0 ? (
                  <>
                    <SectionHeader>
                      <Icon.star className="size-3 shrink-0" />
                      {t('start.favorites')}
                    </SectionHeader>
                    {repos.favorites.map((repo) => (
                      <RepoRow key={repo.path} repo={repo} onPick={() => pickRepo(repo.path)} />
                    ))}
                  </>
                ) : null}
                {repos.recent.length > 0 ? (
                  <>
                    <SectionHeader>
                      <Icon.clock className="size-3 shrink-0" />
                      {t('start.recent')}
                    </SectionHeader>
                    {repos.recent.map((repo) => (
                      <RepoRow key={repo.path} repo={repo} onPick={() => pickRepo(repo.path)} />
                    ))}
                  </>
                ) : null}
              </>
            )}
          </div>
          <div className="border-t p-1">
            <Button
              variant="link"
              size="xs"
              onClick={() => {
                setOpenCrumb(null);
                onStart();
              }}
            >
              {t('breadcrumb.viewAll')}
            </Button>
          </div>
        </div>
      </Crumb>

      <CrumbArrow />

      <Crumb
        caption={t('breadcrumb.branch')}
        label={currentBranch ?? t('breadcrumb.detached')}
        open={openCrumb === 'branch'}
        onOpenChange={(open) => show('branch', open)}
        className="min-w-24 shrink"
      >
        <div className="flex flex-col gap-1">
          <div className="flex px-1 pt-1">
            <SearchField
              value={branchFilter}
              size="xs"
              placeholder={t('breadcrumb.searchBranches')}
              onChange={setBranchFilter}
            />
          </div>
          <div className="max-h-80 overflow-y-auto">
            {branches.length > 0 ? (
              branches.map((choice) => (
                <BranchRow
                  key={choice.ref.name}
                  choice={choice}
                  onPick={() => pickBranch(choice)}
                />
              ))
            ) : (
              <InlineNote>{t('breadcrumb.nothing')}</InlineNote>
            )}
          </div>
        </div>
      </Crumb>
    </div>
  );
}
