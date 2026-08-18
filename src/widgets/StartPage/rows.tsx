import { useTranslation } from 'react-i18next';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';

import { cn } from '@/shared/lib/utils';

import { Icon } from '@/shared/ui/icons';
import { ListRow, NavItem } from '@/shared/ui/parts';

import { laneColour, laneSoft } from '@/shared/ui/theme';

import * as ipc from '@/shared/api/ipc';
import { notifyError } from '@/shared/ui/toast';
import { relativeTime } from '@/shared/lib/time';
import { Hint } from '@/shared/ui/tooltip';

import { hostKindOf } from '@/features/repo';

import type { RecentRepo, RepoListingView, RepoPassportView } from '@/shared/api/types';
export const TILE_TINTS = 12;

export const tintOf = (name: string): number => {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return hash % TILE_TINTS;
};

export const shorten = (path: string) => {
  const match = path.match(/^\/(?:Users|home)\/[^/]+(\/.*)?$/);
  return match ? `~${match[1] ?? ''}` : path;
};

export function OwnerTile({ url, name }: { url: string; name: string }) {
  if (url) {
    return <img src={url} alt="" className="size-5 shrink-0 rounded-sm" />;
  }
  return (
    <span
      className="text-2xs flex size-5 shrink-0 items-center justify-center rounded-sm font-semibold"
      style={{ background: laneSoft(tintOf(name)), color: laneColour(tintOf(name)) }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function SourceRow({
  chosen,
  label,
  count,
  connect,
  badge,
  onPick,
}: {
  chosen: boolean;
  label: string;
  count?: number;
  connect?: boolean;
  badge: React.ReactNode;
  onPick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <NavItem
      active={chosen}
      label={label}
      lead={
        <span className="bg-fill-2 flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-md">
          {badge}
        </span>
      }
      end={
        count !== undefined ? (
          <span className="text-faint shrink-0 tabular-nums">{count}</span>
        ) : connect ? (
          <span className="text-faint shrink-0">{t('start.connect')}</span>
        ) : undefined
      }
      onClick={onPick}
    />
  );
}

export function SourceIcon({ host }: { host: string | null | undefined }) {
  const kind = hostKindOf(host ?? null);
  const Mark =
    kind === 'github'
      ? Icon.github
      : kind === 'gitlab'
        ? Icon.gitlab
        : kind === 'bitbucket'
          ? Icon.bitbucket
          : kind === 'other'
            ? Icon.host
            : Icon.folder;
  return <Mark className="text-faint size-3.5 shrink-0" />;
}

export function StarButton({
  starred,
  onToggle,
}: {
  starred: boolean;
  onToggle: (next: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <Hint text={starred ? t('start.unstar') : t('start.star')}>
      <Button
        variant="muted"
        size="icon-xs"
        reveal={!starred}
        aria-label={starred ? t('start.unstar') : t('start.star')}
        onClick={(e) => {
          e.stopPropagation();
          onToggle(!starred);
        }}
      >
        <Icon.star className={cn('size-3.5', starred && 'text-modified fill-current')} />
      </Button>
    </Hint>
  );
}

export function RepoRow({
  entry,
  passport,
  now,
  language,
  onOpenPath,
  onFavorite,
  onForget,
}: {
  entry: RecentRepo;
  passport: RepoPassportView | undefined;
  now: number;
  language: string;
  onOpenPath: (path: string) => void;
  onFavorite: (path: string, on: boolean) => void;
  onForget: (path: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <ListRow
      as="div"
      tall
      className={cn(!entry.exists && 'opacity-40')}
      title={entry.exists ? entry.path : t('start.missing')}
      onClick={() => entry.exists && onOpenPath(entry.path)}
    >
      <StarButton starred={entry.favorite} onToggle={(next) => onFavorite(entry.path, next)} />
      <SourceIcon host={passport?.host} />
      <span className="shrink-0 text-sm font-medium">{entry.name}</span>
      <span className="text-faint group-hover:text-muted-foreground text-2xs min-w-0 flex-1 truncate font-mono">
        {shorten(entry.path)}
      </span>
      {entry.exists ? (
        passport?.branch ? (
          <span className="text-muted-foreground flex max-w-48 shrink-0 items-center gap-1.5 text-xs">
            <Icon.branch className="size-3.5 shrink-0" />
            <span className="truncate">{passport.branch}</span>
          </span>
        ) : null
      ) : (
        <Badge variant="outline" className="text-faint shrink-0">
          {t('start.missing')}
        </Badge>
      )}
      <span className="text-faint text-2xs w-22 shrink-0 text-right">
        {relativeTime(entry.openedAt, now, language)}
      </span>
      <span className="flex shrink-0 items-center gap-0.5">
        <Hint text={t('menu.reveal')}>
          <Button
            variant="muted"
            size="icon-xs"
            aria-label={t('menu.reveal')}
            onClick={(e) => {
              e.stopPropagation();
              void ipc.revealPath(entry.path, '.').catch(notifyError);
            }}
          >
            <Icon.open className="size-3.5" />
          </Button>
        </Hint>
        <Hint text={t('start.forget')}>
          <Button
            variant="muted"
            size="icon-xs"
            aria-label={t('start.forget')}
            onClick={(e) => {
              e.stopPropagation();
              onForget(entry.path);
            }}
          >
            <Icon.close className="size-3.5" />
          </Button>
        </Hint>
      </span>
    </ListRow>
  );
}

export function HostRepoRow({
  repo,
  starred,
  now,
  language,
  onStar,
  onClone,
}: {
  repo: RepoListingView;
  starred: boolean;
  now: number;
  language: string;
  onStar: (fullName: string, next: boolean) => void;
  onClone: (url: string) => void;
}) {
  const { t } = useTranslation();
  const [owner, name] = repo.fullName.split('/');
  return (
    <ListRow as="div" tall title={repo.description ?? repo.fullName}>
      <StarButton starred={starred} onToggle={(next) => onStar(repo.fullName, next)} />
      <OwnerTile url={repo.ownerAvatarUrl} name={repo.fullName} />
      <span className="min-w-0 shrink-0 truncate text-sm">
        <span className="text-muted-foreground">{owner}/</span>
        <span className="font-medium">{name}</span>
      </span>
      {repo.private ? <Icon.private className="text-faint size-3.5 shrink-0" /> : null}
      <span className="min-w-0 flex-1" />
      <Button
        size="2xs"
        variant="secondary"
        onClick={() => onClone(repo.cloneUrl)}
        className="shrink-0"
      >
        {t('repoDialog.clone')}
      </Button>
      <span className="text-faint text-2xs w-22 shrink-0 text-right">
        {repo.pushedAt ? relativeTime(Date.parse(repo.pushedAt) / 1000, now, language) : ''}
      </span>
    </ListRow>
  );
}
