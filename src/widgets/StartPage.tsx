import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { GIT } from '@/vocabulary';
import { Icon } from '@/icons';
import { InlineNote, ListRow, NavItem, SectionHeader } from '@/parts';
import { clampPanel, PANEL_LIMITS } from '@/resize';
import { laneColour, laneSoft } from '@/theme';
import { usePref } from '@/prefs';
import * as ipc from '@/ipc';
import { notifyError } from '@/toast';
import { relativeTime } from '@/time';
import { Hint } from '@/components/ui/tooltip';
import { hostKindOf, splitListing, splitRecent } from '@/features/repo';
import type { ConnectionView, RecentRepo, RepoListingView, RepoPassportView } from '@/types';

type Props = {
  recent: RecentRepo[];
  onOpen: () => void;
  onOpenPath: (path: string) => void;
  onForget: (path: string) => void;
  onFavorite: (path: string, on: boolean) => void;
  onClone: (url: string) => void;
  onCreate: () => void;
  onConnect: () => void;
};

type Source = 'all' | 'favorites' | string;

const shorten = (path: string) => {
  const match = path.match(/^\/(?:Users|home)\/[^/]+(\/.*)?$/);
  return match ? `~${match[1] ?? ''}` : path;
};

const TILE_TINTS = 12;

const tintOf = (name: string): number => {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return hash % TILE_TINTS;
};

function OwnerTile({ url, name }: { url: string; name: string }) {
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

function SourceRow({
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

function SourceIcon({ host }: { host: string | null | undefined }) {
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

function StarButton({
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

function RepoRow({
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

function HostRepoRow({
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
        {GIT.clone}
      </Button>
      <span className="text-faint text-2xs w-22 shrink-0 text-right">
        {repo.pushedAt ? relativeTime(Date.parse(repo.pushedAt) / 1000, now, language) : ''}
      </span>
    </ListRow>
  );
}

export function StartPage({
  recent,
  onOpen,
  onOpenPath,
  onForget,
  onFavorite,
  onClone,
  onCreate,
  onConnect,
}: Props) {
  const [width] = usePref<number>('sidebar.width', PANEL_LIMITS.sidebar.fallback);
  const { t, i18n } = useTranslation();
  const [source, setSource] = useState<Source>('all');
  const [filter, setFilter] = useState('');
  const [repos, setRepos] = useState<RepoListingView[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [links, setLinks] = useState<ConnectionView[]>([]);
  const [passports, setPassports] = useState<ReadonlyMap<string, RepoPassportView>>(new Map());
  const [hostStars, setHostStars] = usePref<string[]>('start.hostFavorites', []);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let alive = true;
    const pull = () =>
      ipc
        .connections()
        .then((found) => alive && setLinks(found))
        .catch(() => undefined);
    void pull();
    const stop = ipc.onHostConnected(() => void pull());
    return () => {
      alive = false;
      void stop.then((off) => off());
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const paths = recent.filter((r) => r.exists).map((r) => r.path);
    if (paths.length === 0) {
      setPassports(new Map());
      return;
    }
    ipc
      .repoPassports(paths)
      .then((found) => {
        if (alive) setPassports(new Map(found.map((p) => [p.path, p])));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [recent]);

  useEffect(() => {
    const focusSearch = (e: KeyboardEvent) => {
      if (e.key !== 'k' || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  const connection = links.find((c) => c.id === source) ?? null;

  useEffect(() => {
    if (!connection) {
      setRepos([]);
      return;
    }
    let alive = true;
    setBusy(true);
    setFailed(false);
    ipc
      .hostRepos(connection.id, false)
      .then((found) => alive && setRepos(found))
      .catch(() => alive && setFailed(true))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [connection?.id]);

  const refresh = () => {
    if (!connection) return;
    setBusy(true);
    setFailed(false);
    ipc
      .hostRepos(connection.id, true)
      .then(setRepos)
      .catch(() => setFailed(true))
      .finally(() => setBusy(false));
  };

  const now = Date.now() / 1000;
  const needle = filter.trim().toLowerCase();

  const { favorites, rest } = useMemo(() => splitRecent(recent, filter), [recent, filter]);
  const starredHere = useMemo(
    () =>
      new Set(
        hostStars
          .filter((key) => connection && key.startsWith(`${connection.id} `))
          .map((key) => key.slice(`${connection?.id} `.length)),
      ),
    [hostStars, connection],
  );
  const hostSplit = useMemo(
    () => splitListing(repos, starredHere, filter),
    [repos, starredHere, filter],
  );
  const starHostRepo = (fullName: string, next: boolean) => {
    if (!connection) return;
    const key = `${connection.id} ${fullName}`;
    setHostStars(next ? [...hostStars.filter((k) => k !== key), key] : hostStars.filter((k) => k !== key));
  };

  const local = source === 'all' || source === 'favorites';

  const row = (entry: RecentRepo) => (
    <RepoRow
      key={entry.path}
      entry={entry}
      passport={passports.get(entry.path)}
      now={now}
      language={i18n.language}
      onOpenPath={onOpenPath}
      onFavorite={onFavorite}
      onForget={onForget}
    />
  );

  return (
    <>
      <aside
        className="flex shrink-0 flex-col gap-4 px-2.5 pt-1.5 pb-2"
        style={{ width: clampPanel('sidebar', width) }}
      >
        <div className="flex flex-col gap-px">
          <div className="text-faint text-2xs flex h-6 items-center px-2.5 tracking-wide uppercase">
            {t('start.title')}
          </div>
          <SourceRow
            chosen={source === 'all'}
            label={t('start.all')}
            count={recent.length}
            badge={<Icon.folder className="text-muted-foreground size-3" />}
            onPick={() => setSource('all')}
          />
          <SourceRow
            chosen={source === 'favorites'}
            label={t('start.favorites')}
            count={recent.filter((e) => e.favorite).length}
            badge={<Icon.star className="text-modified size-3" />}
            onPick={() => setSource('favorites')}
          />
        </div>

        <div className="flex flex-col gap-px">
          <div className="text-faint text-2xs flex h-6 items-center px-2.5 tracking-wide uppercase">
            {t('start.accounts')}
          </div>
          {links.length === 0 ? (
            <SourceRow
              chosen={false}
              label="GitHub · GitLab"
              connect
              badge={<Icon.github className="text-muted-foreground size-3" />}
              onPick={onConnect}
            />
          ) : (
            links.map((link) => {
              const Mark = Icon[link.kind as 'github'] ?? Icon.host;
              return (
                <SourceRow
                  key={link.id}
                  chosen={source === link.id}
                  label={link.login}
                  count={source === link.id ? repos.length : undefined}
                  badge={<Mark className="text-muted-foreground size-3" />}
                  onPick={() => setSource(link.id)}
                />
              );
            })
          )}
        </div>

        <div className="mt-auto">
          <NavItem
            label={t('start.connectAccount')}
            lead={<Icon.add className="text-faint size-3.5" />}
            onClick={onConnect}
          />
        </div>
      </aside>

      <div className="bg-card flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border">
        <div className="flex h-14 shrink-0 items-center gap-2 px-4">
          <div className="relative min-w-0 flex-1">
            <Icon.search className="text-faint pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
            <Input
              ref={searchRef}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('start.searchRepos')}
              className="h-8 w-full pr-12 pl-8 text-xs"
            />
            <kbd className="text-faint text-2xs border-button-border pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded-sm border px-1.5 py-px">
              ⌘K
            </kbd>
          </div>
          {local ? (
            <>
              <Button size="xs" onClick={onOpen}>
                <Icon.open className="size-3.5" />
                {t('start.open')}
              </Button>
              <Button variant="action" size="xs" onClick={() => onClone('')}>
                <Icon.clone className="size-3.5" />
                {GIT.clone}
              </Button>
              <Button variant="action" size="xs" onClick={onCreate}>
                <Icon.add className="size-3.5" />
                {t('start.create')}
              </Button>
            </>
          ) : connection ? (
            <Hint text={t('host.refresh')}>
              <Button variant="action" size="xs" onClick={refresh} disabled={busy}>
                <Icon.fetch className={cn('size-3.5', busy && 'animate-spin')} />
              </Button>
            </Hint>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {local ? (
            source === 'favorites' ? (
              favorites.length === 0 ? (
                <InlineNote>{t('start.favoritesEmpty')}</InlineNote>
              ) : (
                <div>{favorites.map(row)}</div>
              )
            ) : favorites.length + rest.length === 0 ? (
              <p className="text-muted-foreground px-2 py-3 text-xs">
                {needle ? t('host.searchEmpty') : t('start.recentEmpty')}
              </p>
            ) : (
              <>
                {favorites.length > 0 ? (
                  <>
                    <SectionHeader>
                      <span className="min-w-0 flex-1 truncate text-left">
                        {t('start.favorites')}
                      </span>
                      <span className="text-faint tabular-nums">{favorites.length}</span>
                    </SectionHeader>
                    {favorites.map(row)}
                  </>
                ) : null}
                {rest.length > 0 ? (
                  <>
                    <SectionHeader>
                      <span className="min-w-0 flex-1 truncate text-left">{t('start.recent')}</span>
                      <span className="text-faint tabular-nums">{rest.length}</span>
                    </SectionHeader>
                    {rest.map(row)}
                  </>
                ) : null}
              </>
            )
          ) : !connection ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <span className="bg-fill-2 flex size-10 items-center justify-center rounded-xl">
                <Icon.github className="text-muted-foreground size-5" />
              </span>
              <p className="text-sm font-medium">{t('start.notConnected')}</p>
              <p className="text-faint max-w-60 text-xs leading-relaxed">{t('host.connectHint')}</p>
              <Button size="xs" onClick={onConnect}>
                {t('settings.connect')}
              </Button>
            </div>
          ) : (
            <>
              {hostSplit.favorites.length > 0 ? (
                <>
                  <SectionHeader>
                    <span className="min-w-0 flex-1 truncate text-left">
                      {t('start.favorites')}
                    </span>
                    <span className="text-faint tabular-nums">{hostSplit.favorites.length}</span>
                  </SectionHeader>
                  {hostSplit.favorites.map((repo) => (
                    <HostRepoRow
                      key={repo.fullName}
                      repo={repo}
                      starred
                      now={now}
                      language={i18n.language}
                      onStar={starHostRepo}
                      onClone={onClone}
                    />
                  ))}
                  <SectionHeader>
                    <span className="min-w-0 flex-1 truncate text-left">{t('start.all')}</span>
                    <span className="text-faint tabular-nums">{hostSplit.rest.length}</span>
                  </SectionHeader>
                </>
              ) : null}
              {hostSplit.rest.map((repo) => (
                <HostRepoRow
                  key={repo.fullName}
                  repo={repo}
                  starred={false}
                  now={now}
                  language={i18n.language}
                  onStar={starHostRepo}
                  onClone={onClone}
                />
              ))}
              {busy && repos.length === 0 ? (
                <p className="text-muted-foreground flex items-center gap-1.5 px-2 py-3 text-xs">
                  <Icon.waiting className="size-3 animate-spin" />
                  {t('host.loading')}
                </p>
              ) : null}
              {!busy && failed ? (
                <p className="text-muted-foreground px-2 py-3 text-xs">{t('host.failed')}</p>
              ) : null}
              {!busy &&
              !failed &&
              repos.length > 0 &&
              hostSplit.favorites.length + hostSplit.rest.length === 0 ? (
                <p className="text-muted-foreground px-2 py-3 text-xs">{t('host.searchEmpty')}</p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </>
  );
}
