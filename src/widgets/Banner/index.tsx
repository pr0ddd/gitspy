import { useTranslation } from 'react-i18next';

import { Progress } from '@/shared/ui/progress';
import type { BannerUpdateView } from '@/shared/api/types';

import { History } from './History';

export { useBannerUpdate } from './useBannerUpdate';

type Props = {
  update: BannerUpdateView | null;
};

export function Banner({ update }: Props) {
  const { t } = useTranslation();

  return (
    <div
      data-tauri-drag-region
      data-theme="midnight"
      className="relative flex h-full w-full flex-col overflow-hidden rounded-2xl bg-background text-foreground select-none"
    >
      <History className="pointer-events-none absolute inset-0 size-full" />
      <span className="grow" />
      <div className="relative flex h-14 shrink-0 flex-col justify-end gap-2 px-8">
        {update && (
          <>
            <span className="text-muted-foreground text-xs">
              {t('banner.updating', { version: update.version })}
            </span>
            <Progress className="h-0.5" value={update.percent} />
          </>
        )}
      </div>
      <span className="relative mt-5 mb-9 self-center font-display text-2xl tracking-wide uppercase">
        {t('banner.name')}
      </span>
    </div>
  );
}
