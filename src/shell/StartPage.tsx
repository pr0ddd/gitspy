import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { GIT } from '../vocabulary';
import { Icon } from '../icons';
import { HostRepos } from './HostRepos';
import type { AccountView, RecentRepo } from '../types';
import { Hint } from '@/components/ui/tooltip';

type Props = {
  recent: RecentRepo[];
  account: AccountView | null;
  onOpen: () => void;
  onOpenPath: (path: string) => void;
  onForget: (path: string) => void;
  onClone: (url: string) => void;
  onCreate: () => void;
  onConnect: () => void;
};

const shorten = (path: string) => {
  const match = path.match(/^\/(?:Users|home)\/[^/]+(\/.*)?$/);
  return match ? `~${match[1] ?? ''}` : path;
};

export function StartPage({
  recent,
  account,
  onOpen,
  onOpenPath,
  onForget,
  onClone,
  onCreate,
  onConnect,
}: Props) {
  const { t, i18n } = useTranslation();
  const relative = new Intl.RelativeTimeFormat(i18n.language, {
    numeric: 'auto',
  });

  const ago = (seconds: number) => {
    if (!Number.isFinite(seconds)) return '';
    const delta = Math.round(seconds - Date.now() / 1000);
    if (Math.abs(delta) < 3600) return relative.format(Math.round(delta / 60), 'minute');
    if (Math.abs(delta) < 86400) return relative.format(Math.round(delta / 3600), 'hour');
    return relative.format(Math.round(delta / 86400), 'day');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="bg-card border-border flex shrink-0 items-center justify-between border-b px-4 py-2.5">
        <div>
          <h1 className="text-sm font-medium">{t('start.title')}</h1>
          <p className="text-muted-foreground text-xs">
            {t('start.repoCount', { count: recent.length })}
          </p>
        </div>

        <div className="flex gap-2">
          <Button onClick={onOpen} size="sm" className="h-7">
            <Icon.open className="size-3.5" />
            {t('start.open')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onClone('')} className="h-7">
            <Icon.clone className="size-3.5" />
            {GIT.clone}
          </Button>
          <Button variant="secondary" size="sm" onClick={onCreate} className="h-7">
            <Icon.add className="size-3.5" />
            {t('start.create')}
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_22rem]">
        <ScrollArea className="min-h-0">
          <div className="p-3">
            <h2 className="text-muted-foreground mb-2 px-1 text-xs tracking-wide uppercase">
              {t('start.recent')}
            </h2>

            {recent.length === 0 ? (
              <p className="text-muted-foreground/70 px-1 text-sm">{t('start.recentEmpty')}</p>
            ) : (
              <ul className="space-y-1">
                {recent.map((entry, i) => (
                  <motion.li
                    key={entry.path}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.18,
                      delay: Math.min(i, 8) * 0.02,
                    }}
                    className="group"
                  >
                    <div
                      className={cn(
                        'bg-card border-border hover:border-primary/40 hover:bg-surface-hover flex items-center gap-3 rounded-md border pr-2 transition-colors',
                        !entry.exists && 'opacity-40',
                      )}
                    >
                      <Hint text={entry.exists ? entry.path : t('start.missing')}>
                        <button
                          onClick={() => entry.exists && onOpenPath(entry.path)}
                          className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left"
                        >
                          <span className="bg-surface-raised flex size-7 shrink-0 items-center justify-center rounded-md">
                            <Icon.branch className="text-muted-foreground size-3.5" />
                          </span>

                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{entry.name}</span>
                            <span className="text-muted-foreground/70 block truncate font-mono text-xs">
                              {shorten(entry.path)}
                            </span>
                          </span>

                          <span className="text-muted-foreground/60 shrink-0 text-xs">
                            {ago(entry.openedAt)}
                          </span>
                        </button>
                      </Hint>

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
                  </motion.li>
                ))}
              </ul>
            )}
          </div>
        </ScrollArea>

        <HostRepos account={account} onClone={onClone} onConnect={onConnect} />
      </div>
    </div>
  );
}
