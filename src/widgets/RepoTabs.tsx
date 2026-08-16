import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';
import { Icon } from '@/shared/ui/icons';
import { hostOf } from '@/entities/repo';
import type { Session } from '@/entities/repo';
import { Hint } from '@/shared/ui/tooltip';
import { Tab } from '@/shared/ui/parts';
import { VIEW_TABS, type ViewTab } from '@/features/views';

type Props = {
  sessions: Session[];
  active: string | null;
  views: readonly ViewTab[];
  view: ViewTab | null;
  onActivate: (path: string) => void;
  onClose: (path: string) => void;
  onStart: () => void;
  onCloseStart: () => void;
  onView: (view: ViewTab) => void;
  onCloseView: (view: ViewTab) => void;
};

export function RepoTabs({
  sessions,
  active,
  views,
  view,
  onActivate,
  onClose,
  onStart,
  onCloseStart,
  onView,
  onCloseView,
}: Props) {
  const { t } = useTranslation();
  const startTabShown =
    active === null && view === null && (sessions.length > 0 || views.length > 0);

  return (
    <nav
      data-tauri-drag-region
      className="flex h-9.5 shrink-0 items-center gap-1 overflow-x-auto pr-2 pl-20"
    >
      {sessions.map((session) => (
        <Tab
          key={session.path}
          icon={hostOf(session.repo?.remotes ?? []) ?? 'folder'}
          label={session.name}
          title={session.path}
          current={session.path === active}
          closeLabel={t('repo.close')}
          onSelect={() => onActivate(session.path)}
          onClose={() => onClose(session.path)}
        />
      ))}
      {views.map((open) => (
        <Tab
          key={open}
          icon={VIEW_TABS[open].icon}
          label={t(VIEW_TABS[open].title as 'settings.title')}
          current={open === view}
          closeLabel={t('repo.close')}
          onSelect={() => onView(open)}
          onClose={() => onCloseView(open)}
        />
      ))}
      {startTabShown ? (
        <Tab
          icon="folder"
          label={t('start.newTab')}
          current
          closeLabel={t('repo.close')}
          onSelect={onStart}
          onClose={onCloseStart}
        />
      ) : null}
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
          onClick={() => onView('settings')}
          className="text-muted-foreground mr-1 ml-auto size-6.5"
        >
          <Icon.settings className="size-3.5" />
        </Button>
      </Hint>
    </nav>
  );
}
