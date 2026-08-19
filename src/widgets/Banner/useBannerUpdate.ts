import { useEffect, useState } from 'react';

import * as ipc from '@/shared/api/ipc';
import type { BannerUpdateView } from '@/shared/api/types';

export function useBannerUpdate(): BannerUpdateView | null {
  const [update, setUpdate] = useState<BannerUpdateView | null>(null);

  useEffect(() => {
    const stop = ipc.onBannerUpdate(setUpdate);
    return () => {
      void stop.then((off) => off()).catch(() => undefined);
    };
  }, []);

  return update;
}
