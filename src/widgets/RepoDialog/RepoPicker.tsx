import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/ui/button';

import { Input } from '@/shared/ui/input';

import { Icon } from '@/shared/ui/icons';

import { HOVER_FILL } from '@/shared/ui/parts';

import { cn } from '@/shared/lib/utils';

import type { RepoListingView } from '@/shared/api/types';
export function ownerOf(fullName: string): string {
  return fullName.split('/')[0] ?? '';
}

export function RepoPicker({
  repos,
  chosen,
  onPick,
}: {
  repos: RepoListingView[];
  chosen: RepoListingView | null;
  onPick: (repo: RepoListingView | null) => void;
}) {
  const { t } = useTranslation();
  const [needle, setNeedle] = useState('');

  const shown = needle.trim()
    ? repos.filter((repo) => repo.fullName.toLowerCase().includes(needle.trim().toLowerCase()))
    : repos;
  const owners = [...new Set(shown.map((repo) => ownerOf(repo.fullName)))];

  if (chosen) {
    return (
      <div className="border-input flex h-8 w-full items-center gap-2 rounded-md border px-3 text-xs">
        {chosen.private ? (
          <Icon.private className="text-faint size-3 shrink-0" />
        ) : (
          <Icon.web className="text-faint size-3 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate">{chosen.fullName}</span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => onPick(null)}
          aria-label={t('repoDialog.clearPick')}
        >
          <Icon.close className="size-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-1.5">
      <Input
        value={needle}
        onChange={(e) => setNeedle(e.target.value)}
        placeholder={t('repoDialog.searchRemotes')}
        className="h-8 text-xs"
      />
      <div className="h-72 overflow-y-auto rounded-md border">
        {owners.map((owner) => (
          <div key={owner}>
            <div className="text-faint text-2xs sticky top-0 flex h-6 items-center bg-card px-3 tracking-wide uppercase">
              {owner}
            </div>
            {shown
              .filter((repo) => ownerOf(repo.fullName) === owner)
              .map((repo) => (
                <button
                  key={repo.fullName}
                  onClick={() => onPick(repo)}
                  className={cn(
                    HOVER_FILL,
                    'flex h-8 w-full items-center gap-2 px-3 text-left text-xs',
                  )}
                >
                  {repo.private ? (
                    <Icon.private className="text-faint size-3 shrink-0" />
                  ) : (
                    <Icon.web className="text-faint size-3 shrink-0" />
                  )}
                  <span className="truncate">{repo.fullName}</span>
                </button>
              ))}
          </div>
        ))}
        {shown.length === 0 ? (
          <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
            {t('repoDialog.noRepos')}
          </div>
        ) : null}
      </div>
    </div>
  );
}
