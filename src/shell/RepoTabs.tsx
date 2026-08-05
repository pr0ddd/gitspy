import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Icon } from '../icons';
import { hostOf } from '../host';
import type { Session } from '../session';
import { Hint } from '@/components/ui/tooltip';

type Props = {
  sessions: Session[];
  active: string | null;
  onActivate: (path: string) => void;
  onClose: (path: string) => void;
  onStart: () => void;
  onSettings: () => void;
};

export function RepoTabs({
  sessions,
  active,
  onActivate,
  onClose,
  onStart,
  onSettings,
}: Props) {
  const { t } = useTranslation();

  return (
    <nav
      data-tauri-drag-region
      className="flex h-9.5 shrink-0 items-center gap-1 overflow-x-auto pr-2 pl-20"
    >
      {sessions.map((session) => {
        const current = session.path === active;
        const host = hostOf(session.repo?.remotes ?? []);
        const Mark = host ? Icon[host] : Icon.folder;
        return (
            <div
              key={session.path}
              title={session.path}
              onClick={() => onActivate(session.path)}
              className={cn(
                'group flex h-7.5 max-w-56 cursor-pointer items-center gap-2 rounded-md pl-3 pr-1.5 text-xs whitespace-nowrap transition-colors',
                current
                  ? 'bg-fill-2 text-foreground'
                  : 'text-muted-foreground hover:bg-fill-1',
              )}
            >
              <Mark className={cn('size-3.5 shrink-0', current ? '' : 'opacity-75')} />
              <span className="min-w-0 truncate">{session.name}</span>
              <Button
                variant="muted"
                size="icon-2xs"
                reveal
                className={cn(current && 'opacity-100')}
                aria-label={t('repo.close')}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(session.path);
                }}
              >
                <Icon.close />
              </Button>
            </div>
        );
      })}
      <Hint text={t('start.title')}>
        <Button
          variant="ghost"
          size="icon"
          onClick={onStart}
          className={cn('ml-1 size-6.5', active === null && 'bg-fill-2 text-foreground')}
        >
          <Icon.add className="size-3.5" />
        </Button>
      </Hint>

      <Hint text={t('settings.open')}>
        <Button
          variant="ghost"
          size="icon"
          onClick={onSettings}
          className="text-muted-foreground mr-1 ml-auto size-6.5"
        >
          <Icon.settings className="size-3.5" />
        </Button>
      </Hint>
    </nav>
  );
}
