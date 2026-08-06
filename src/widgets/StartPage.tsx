import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { GIT } from '@/vocabulary';
import { Icon } from '@/icons';
import { HOVER_FILL, NavItem } from '@/parts';
import { clampPanel, PANEL_LIMITS } from '@/resize';
import { usePref } from '@/prefs';
import * as ipc from '@/ipc';
import { relativeTime } from '@/time';
import { Hint } from '@/components/ui/tooltip';
import type { ConnectionView, RecentRepo, RepoListingView } from '@/types';

type Props = {
  recent: RecentRepo[];
  onOpen: () => void;
  onOpenPath: (path: string) => void;
  onForget: (path: string) => void;
  onClone: (url: string) => void;
  onCreate: () => void;
  onConnect: () => void;
};

type Source = string;

const shorten = (path: string) => {
  const match = path.match(/^\/(?:Users|home)\/[^/]+(\/.*)?$/);
  return match ? `~${match[1] ?? ''}` : path;
};

const initialsOf = (name: string) => name.slice(0, 2).toLowerCase();

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

export function StartPage({
  recent,
  onOpen,
  onOpenPath,
  onForget,
  onClone,
  onCreate,
  onConnect,
}: Props) {
  const [width] = usePref<number>('sidebar.width', PANEL_LIMITS.sidebar.fallback);
  const { t, i18n } = useTranslation();
  const [source, setSource] = useState<Source>('local');
  const [filter, setFilter] = useState('');
  const [repos, setRepos] = useState<RepoListingView[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [links, setLinks] = useState<ConnectionView[]>([]);

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

  const shownRecent = useMemo(
    () => (needle ? recent.filter((r) => r.name.toLowerCase().includes(needle)) : recent),
    [recent, needle],
  );
  const shownRepos = useMemo(
    () => (needle ? repos.filter((r) => r.fullName.toLowerCase().includes(needle)) : repos),
    [repos, needle],
  );

  const local = source === 'local';
  const hasRows = local ? shownRecent.length > 0 : connection !== null && shownRepos.length > 0;

  return (
    <>
      <aside
        className="flex shrink-0 flex-col gap-4 px-2.5 pt-1.5"
        style={{ width: clampPanel('sidebar', width) }}
      >
        <div className="flex flex-col gap-px">
          <div className="text-faint flex h-6 items-center px-2.5 text-2xs tracking-wide uppercase">
            {t('start.library')}
          </div>
          <SourceRow
            chosen={local}
            label={t('start.local')}
            count={recent.length}
            badge={<Icon.folder className="text-muted-foreground size-3" />}
            onPick={() => setSource('local')}
          />
        </div>

        <div className="flex flex-col gap-px">
          <div className="text-faint flex h-6 items-center px-2.5 text-2xs tracking-wide uppercase">
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
      </aside>

      <div className="bg-card shadow-sheet flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border">
        <div className="flex h-16 shrink-0 items-center gap-3.5 px-6">
          <span className="bg-fill-2 flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md">
            {local ? (
              <Icon.folder className="text-muted-foreground size-4" />
            ) : (
              <Icon.host className="text-muted-foreground size-4" />
            )}
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-base font-medium">
              {local ? t('start.local') : (connection?.login ?? 'GitHub')}
            </span>
            <span className="text-faint text-2xs truncate">
              {local
                ? t('start.repoCount', { count: recent.length })
                : (connection?.baseUrl ?? t('host.connectHint'))}
            </span>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {hasRows || needle ? (
              <div className="relative">
                <Icon.search className="text-faint pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
                <Input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder={t('start.filterRepos')}
                  className="h-8 w-56 pl-8 text-xs"
                />
              </div>
            ) : null}
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
        </div>

        {hasRows ? (
          <div className="text-faint flex h-6 shrink-0 items-center px-6 text-2xs tracking-wide uppercase">
            <span className="flex-1">{t('start.repository')}</span>
            <span className="w-22 shrink-0 text-right">{t('start.updated')}</span>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {local ? (
            shownRecent.length === 0 ? (
              <p className="text-muted-foreground px-2 py-3 text-xs">
                {needle ? t('host.searchEmpty') : t('start.recentEmpty')}
              </p>
            ) : (
              <ul>
                {shownRecent.map((entry) => (
                  <li key={entry.path} className="group">
                    <div
                      className={cn(
                        HOVER_FILL,
                        'flex h-16 items-center gap-3 rounded-lg px-2',
                        !entry.exists && 'opacity-40',
                      )}
                    >
                        <button
                          title={entry.exists ? entry.path : t('start.missing')}
                          onClick={() => entry.exists && onOpenPath(entry.path)}
                          className="flex h-full min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <span className="bg-fill-2 text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md text-2xs font-semibold">
                            {initialsOf(entry.name)}
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col gap-1">
                            <span className="truncate text-sm font-medium">{entry.name}</span>
                            <span className="text-faint truncate font-mono text-2xs">
                              {shorten(entry.path)}
                            </span>
                          </span>
                          <span className="text-faint w-22 shrink-0 text-right text-2xs">
                            {relativeTime(entry.openedAt, now, i18n.language)}
                          </span>
                        </button>
                      <Button
                        variant="muted"
                        size="icon-xs"
                        reveal
                        aria-label={t('start.forget')}
                        onClick={() => onForget(entry.path)}
                      >
                        <Icon.close />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
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
              <ul>
                {shownRepos.map((repo) => (
                  <li key={repo.fullName} className="group">
                    <div className={cn(HOVER_FILL, 'flex h-16 items-center gap-3 rounded-lg px-2')}>
                      <img
                        src={repo.ownerAvatarUrl}
                        alt=""
                        className="size-8 shrink-0 rounded-md"
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm">
                            <span className="text-muted-foreground">
                              {repo.fullName.split('/')[0]}/
                            </span>
                            <span className="font-medium">{repo.fullName.split('/')[1]}</span>
                          </span>
                          {repo.private ? (
                            <Icon.private className="text-faint size-3 shrink-0" />
                          ) : null}
                        </span>
                        {repo.description ? (
                          <span className="text-faint truncate text-2xs">{repo.description}</span>
                        ) : null}
                      </span>
                      <Button
                        size="2xs"
                        variant="secondary"
                        reveal
                        onClick={() => onClone(repo.cloneUrl)}
                        className="shrink-0"
                      >
                        {GIT.clone}
                      </Button>
                      <span className="text-faint w-22 shrink-0 text-right text-2xs">
                        {repo.pushedAt
                          ? relativeTime(Date.parse(repo.pushedAt) / 1000, now, i18n.language)
                          : ''}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              {busy && repos.length === 0 ? (
                <p className="text-muted-foreground flex items-center gap-1.5 px-2 py-3 text-xs">
                  <Icon.waiting className="size-3 animate-spin" />
                  {t('host.loading')}
                </p>
              ) : null}
              {!busy && failed ? (
                <p className="text-muted-foreground px-2 py-3 text-xs">{t('host.failed')}</p>
              ) : null}
              {!busy && !failed && repos.length > 0 && shownRepos.length === 0 ? (
                <p className="text-muted-foreground px-2 py-3 text-xs">{t('host.searchEmpty')}</p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </>
  );
}
