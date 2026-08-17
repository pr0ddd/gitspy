import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icons';

export function WindowControls() {
  const { t } = useTranslation();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const current = getCurrentWindow();
    let alive = true;
    const refresh = () => {
      void current.isMaximized().then((is) => {
        if (alive) setMaximized(is);
      });
    };
    refresh();
    const stopping = current.onResized(refresh);
    return () => {
      alive = false;
      void stopping.then((stop) => stop());
    };
  }, []);

  return (
    <div className="flex h-full shrink-0 self-stretch">
      <Button
        variant="caption"
        size="icon-caption"
        aria-label={t('window.minimize')}
        onClick={() => void getCurrentWindow().minimize()}
      >
        <Icon.windowMinimize />
      </Button>
      <Button
        variant="caption"
        size="icon-caption"
        aria-label={maximized ? t('window.restore') : t('window.maximize')}
        onClick={() => void getCurrentWindow().toggleMaximize()}
      >
        {maximized ? <Icon.windowRestore /> : <Icon.windowMaximize />}
      </Button>
      <Button
        variant="captionClose"
        size="icon-caption"
        aria-label={t('window.close')}
        onClick={() => void getCurrentWindow().close()}
      >
        <Icon.close />
      </Button>
    </div>
  );
}
