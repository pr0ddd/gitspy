import { useCallback, useState } from 'react';
import type { IconName } from '@/shared/ui/icons';

export type ViewTab = 'settings' | 'changelog';

export const VIEW_TABS: Record<ViewTab, { icon: IconName; title: string }> = {
  settings: { icon: 'settings', title: 'settings.title' },
  changelog: { icon: 'changelog', title: 'changelog.title' },
};

export function useViewTabs() {
  const [views, setViews] = useState<ViewTab[]>([]);
  const [view, setView] = useState<ViewTab | null>(null);

  const open = useCallback((tab: ViewTab) => {
    setViews((now) => (now.includes(tab) ? now : [...now, tab]));
    setView(tab);
  }, []);

  const close = useCallback((tab: ViewTab) => {
    setViews((now) => now.filter((each) => each !== tab));
    setView((now) => (now === tab ? null : now));
  }, []);

  const leave = useCallback(() => setView(null), []);

  return { views, view, open, close, leave };
}
