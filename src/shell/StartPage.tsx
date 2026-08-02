import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { CloudDownload, FolderOpen, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { GIT } from '../vocabulary';
import type { RecentRepo } from '../types';

type Props = {
  recent: RecentRepo[];
  onOpen: () => void;
  onOpenPath: (path: string) => void;
  onForget: (path: string) => void;
};

const shorten = (path: string) => {
  const match = path.match(/^\/(?:Users|home)\/[^/]+(\/.*)?$/);
  return match ? `~${match[1] ?? ''}` : path;
};

export function StartPage({ recent, onOpen, onOpenPath, onForget }: Props) {
  const { t, i18n } = useTranslation();
  const relative = new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' });

  const ago = (seconds: number) => {
    const delta = Math.round(seconds - Date.now() / 1000);
    if (Math.abs(delta) < 3600) return relative.format(Math.round(delta / 60), 'minute');
    if (Math.abs(delta) < 86400) return relative.format(Math.round(delta / 3600), 'hour');
    return relative.format(Math.round(delta / 86400), 'day');
  };

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto w-full max-w-2xl px-8 py-10">
        <h1 className="mb-5 text-xl font-semibold tracking-tight">{t('start.title')}</h1>

        <div className="mb-8 flex gap-2">
          <Button onClick={onOpen} className="h-8">
            <FolderOpen className="size-3.5" />
            {t('start.open')}
          </Button>
          {[
            { label: GIT.clone, icon: CloudDownload },
            { label: t('start.create'), icon: Plus },
          ].map(({ label, icon: Icon }) => (
            <Tooltip key={label}>
              <TooltipTrigger asChild>
                <span tabIndex={0}>
                  <Button variant="secondary" disabled className="h-8">
                    <Icon className="size-3.5" />
                    {label}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{t('start.needsOperations')}</TooltipContent>
            </Tooltip>
          ))}
        </div>

        <h2 className="text-muted-foreground mb-2 text-xs tracking-wide uppercase">
          {t('start.recent')}
        </h2>

        {recent.length === 0 ? (
          <p className="text-muted-foreground/70">{t('start.recentEmpty')}</p>
        ) : (
          <ul className="-mx-2">
            {recent.map((entry, i) => (
              <motion.li
                key={entry.path}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, delay: Math.min(i, 8) * 0.02 }}
              >
                <button
                  onClick={() => entry.exists && onOpenPath(entry.path)}
                  title={entry.exists ? entry.path : t('start.missing')}
                  className={cn(
                    'group hover:bg-surface-hover flex h-8 w-full items-baseline gap-3 rounded-md px-2 text-left transition-colors',
                    !entry.exists && 'opacity-40',
                  )}
                >
                  <span className="text-primary font-medium">{entry.name}</span>
                  <span className="text-muted-foreground truncate font-mono text-xs">
                    {shorten(entry.path)}
                  </span>
                  <span className="text-muted-foreground/60 ml-auto shrink-0 text-xs">
                    {ago(entry.opened_at)}
                  </span>
                  <Button
                    asChild
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-foreground size-5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <span
                      title={t('start.forget')}
                      onClick={(e) => {
                        e.stopPropagation();
                        onForget(entry.path);
                      }}
                    >
                      <X className="size-3" />
                    </span>
                  </Button>
                </button>
              </motion.li>
            ))}
          </ul>
        )}
      </div>
    </ScrollArea>
  );
}
