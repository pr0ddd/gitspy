import { Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Session } from '../session';

type Props = {
  sessions: Session[];
  active: string | null;
  onActivate: (path: string) => void;
  onClose: (path: string) => void;
  onStart: () => void;
};

export function RepoTabs({ sessions, active, onActivate, onClose, onStart }: Props) {
  const { t } = useTranslation();

  return (
    <nav className="bg-surface border-border flex shrink-0 items-stretch gap-px overflow-x-auto border-b">
      {sessions.map((session) => {
        const current = session.path === active;
        return (
          <div
            key={session.path}
            onClick={() => onActivate(session.path)}
            title={session.path}
            className={cn(
              'group flex max-w-56 cursor-pointer items-center gap-2 border-t-2 py-1.5 pr-2 pl-3 whitespace-nowrap transition-colors',
              current
                ? 'border-t-primary bg-card text-foreground'
                : 'text-muted-foreground hover:bg-surface-hover border-t-transparent',
            )}
          >
            <span className="truncate">{session.name}</span>
            <Button
              variant="ghost"
              size="icon"
              title={t('repo.close')}
              onClick={(e) => {
                e.stopPropagation();
                onClose(session.path);
              }}
              className="text-muted-foreground hover:text-foreground size-4 opacity-0 transition-opacity group-hover:opacity-100"
            >
              <X className="size-3" />
            </Button>
          </div>
        );
      })}
      <Button
        variant="ghost"
        size="icon"
        title={t('start.title')}
        onClick={onStart}
        className={cn('my-1 ml-1 size-6', active === null && 'bg-surface-hover text-foreground')}
      >
        <Plus className="size-3.5" />
      </Button>
    </nav>
  );
}
