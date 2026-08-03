import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Icon } from '../icons';
import { ListRow } from './parts';
import * as ipc from '../ipc';
import { GIT } from '../vocabulary';
import type { AccountView, RepoListingView } from '../types';
import { Hint } from '@/components/ui/tooltip';

const HOST = 'github';

type Props = {
  account: AccountView | null;
  onClone: (url: string) => void;
  onConnect: () => void;
};

export function HostRepos({ account, onClone, onConnect }: Props) {
  const { t } = useTranslation();
  const [repos, setRepos] = useState<RepoListingView[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!account) {
      setRepos([]);
      return;
    }

    let alive = true;
    setBusy(true);
    setFailed(false);
    ipc
      .hostRepos(HOST, false)
      .then((found) => alive && setRepos(found))
      .catch(() => alive && setFailed(true))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [account]);

  const refresh = () => {
    setBusy(true);
    setFailed(false);
    ipc
      .hostRepos(HOST, true)
      .then(setRepos)
      .catch(() => setFailed(true))
      .finally(() => setBusy(false));
  };

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return repos;
    return repos.filter((repo) => repo.fullName.toLowerCase().includes(needle));
  }, [repos, query]);

  return (
    <aside className="bg-card border-border flex min-h-0 shrink-0 flex-col border-l lg:w-96">
      <div className="border-border flex h-10 shrink-0 items-center gap-2 border-b px-3">
        <Icon.host className="text-muted-foreground size-3.5" />
        <h2 className="text-sm font-medium">GitHub</h2>

        {account && (
          <>
            <span className="text-muted-foreground text-xs">
              {t('host.repoCount', { count: repos.length })}
            </span>
            <Hint text={t('host.refresh')}>
              <Button
                variant="ghost"
                size="icon"
                onClick={refresh}
                disabled={busy}
                className="text-muted-foreground ml-auto size-6"
              >
                <Icon.fetch className={cn('size-3.5', busy && 'animate-spin')} />
              </Button>
            </Hint>
          </>
        )}
      </div>

      {!account ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <span className="bg-surface-raised flex size-10 items-center justify-center rounded-full">
            <Icon.host className="text-muted-foreground size-5" />
          </span>
          <p className="text-muted-foreground text-xs leading-relaxed">{t('host.connectHint')}</p>
          <Button size="xs" onClick={onConnect}>
            {t('settings.connect')}
          </Button>
        </div>
      ) : (
        <>
          <div className="border-border flex items-center gap-2 border-b px-3 py-2">
            <img src={account.avatarUrl} alt="" className="size-6 shrink-0 rounded-full" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">
                {account.name ?? account.login}
              </span>
              <span className="text-muted-foreground block truncate text-xs">
                {account.login}
              </span>
            </span>
          </div>

          <div className="p-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('host.search')}
              className="h-7"
            />
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <ul className="px-2 pb-2">
              {shown.map((repo) => (
                <li key={repo.fullName}>
                  <ListRow as="div">
                    <span className="min-w-0 truncate">
                      <span className="text-muted-foreground">{repo.fullName.split('/')[0]}/</span>
                      <span className="font-medium">{repo.fullName.split('/')[1]}</span>
                    </span>

                    {repo.private && (
                      <Icon.private className="text-muted-foreground size-3 shrink-0" />
                    )}

                  <Button
                      size="2xs"
                      variant="secondary"
                      reveal
                      onClick={() => onClone(repo.cloneUrl)}
                      className="ml-auto"
                    >
                      {GIT.clone}
                    </Button>
                  </ListRow>
                </li>
              ))}
            </ul>

            {busy && repos.length === 0 && (
              <p className="text-muted-foreground flex items-center gap-1.5 px-4 py-2 text-xs">
                <Icon.waiting className="size-3 animate-spin" />
                {t('host.loading')}
              </p>
            )}

            {!busy && failed && (
              <p className="text-muted-foreground px-4 py-2 text-xs">{t('host.failed')}</p>
            )}

            {!busy && !failed && repos.length > 0 && shown.length === 0 && (
              <p className="text-muted-foreground px-4 py-2 text-xs">{t('host.searchEmpty')}</p>
            )}
          </ScrollArea>
        </>
      )}
    </aside>
  );
}
