import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Icon } from '../icons';

type Props = { ready: string | null; onRestart: () => void };

export function BottomBar({ ready, onRestart }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex h-6 shrink-0 items-center justify-end gap-2 px-1.5">
      {ready ? (
        <Button variant="muted" size="2xs" onClick={onRestart}>
          <Icon.update className="size-3" />
          {t('update.restart', { version: ready })}
        </Button>
      ) : null}
      <span className="text-faint text-2xs tabular-nums">{__APP_VERSION__}</span>
    </div>
  );
}
