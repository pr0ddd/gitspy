import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Icon } from '../icons';
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

export function RepoTabs({ sessions, active, onActivate, onClose, onStart, onSettings }: Props) {
  const { t } = useTranslation();

  return (
    <nav className="bg-surface border-border flex shrink-0 items-stretch gap-px overflow-x-auto border-b">
      {sessions.map((session) => {
        const current = session.path === active;
        return (
          <Hint key={session.path} text={session.path}>
            <div
              onClick={() => onActivate(session.path)}
              className={cn(
                'group flex max-w-56 cursor-pointer items-center gap-2 border-t-2 py-1.5 pr-2 pl-3 whitespace-nowrap transition-colors',
                current
                  ? 'border-t-primary bg-card text-foreground'
                  : 'text-muted-foreground hover:bg-surface-hover border-t-transparent',
              )}
            >
              <Icon.branch className="size-3 shrink-0 opacity-70" />
              <span className="truncate">{session.name}</span>
              <Button
                variant="muted"
                size="icon-2xs"
                reveal
                aria-label={t('repo.close')}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(session.path);
                }}
              >
                <Icon.close />
              </Button>
            </div>
          </Hint>
        );
      })}
      <Hint text={t('start.title')}>
        <Button
          variant="ghost"
          size="icon"
          onClick={onStart}
          className={cn('my-1 ml-1 size-6', active === null && 'bg-surface-hover text-foreground')}
        >
          <Icon.add className="size-3.5" />
        </Button>
      </Hint>

      <Hint text={t('settings.open')}>
        <Button
          variant="ghost"
          size="icon"
          onClick={onSettings}
          className="text-muted-foreground my-1 mr-1 ml-auto size-6"
        >
          <Icon.settings className="size-3.5" />
        </Button>
      </Hint>
    </nav>
  );
}
