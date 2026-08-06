import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Icon } from '@/icons';
import { hostOf } from '@/host';
import type { Session } from '@/entities/repo';
import { Hint } from '@/components/ui/tooltip';
import { Tab } from '@/parts';

type Props = {
  sessions: Session[];
  active: string | null;
  settings: 'closed' | 'open' | 'active';
  onActivate: (path: string) => void;
  onClose: (path: string) => void;
  onStart: () => void;
  onSettings: () => void;
  onCloseSettings: () => void;
};

export function RepoTabs({
  sessions,
  active,
  settings,
  onActivate,
  onClose,
  onStart,
  onSettings,
  onCloseSettings,
}: Props) {
  const { t } = useTranslation();

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
      {settings === 'closed' ? null : (
        <Tab
          icon="settings"
          label={t('settings.title')}
          current={settings === 'active'}
          closeLabel={t('repo.close')}
          onSelect={onSettings}
          onClose={onCloseSettings}
        />
      )}
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
