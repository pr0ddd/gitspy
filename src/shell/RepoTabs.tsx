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
    <nav className="flex h-9.5 shrink-0 items-center gap-1 overflow-x-auto px-2">
      {sessions.map((session) => {
        const current = session.path === active;
        return (
          <Hint key={session.path} text={session.path}>
            <div
              onClick={() => onActivate(session.path)}
              className={cn(
                'group flex h-7 max-w-56 cursor-pointer items-center gap-2 rounded-md pr-1.5 pl-2.5 whitespace-nowrap transition-colors',
                current
                  ? 'bg-fill-2 text-foreground'
                  : 'text-muted-foreground hover:bg-fill-1',
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
