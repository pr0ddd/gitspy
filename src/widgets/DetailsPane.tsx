import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/utils';
import { clampPanel } from '@/shared/lib/resize';
import { PANEL_LIMITS } from '@/shared/lib/resize';
import { usePref } from '@/shared/lib/prefs';
import { PanelNote, ResizeGrip } from '@/shared/ui/parts';

type Props = {
  children: React.ReactNode;
  note: 'workingTreeClean' | 'noCommits' | null;
  fill?: boolean;
};

export function DetailsPane({ children, note, fill }: Props) {
  const { t } = useTranslation();
  const [width, setWidth] = usePref<number>('details.width', PANEL_LIMITS.details.fallback);
  const dragFrom = useRef(width);

  return (
    <aside
      className={cn(
        'bg-fill-1 relative flex flex-col border-l',
        fill ? 'min-w-0 flex-1' : 'shrink-0',
      )}
      style={fill ? undefined : { width: clampPanel('details', width) }}
    >
      {fill ? null : (
        <ResizeGrip
          name="details"
          label={t('resize.details')}
          edge="left"
          onStart={() => {
            dragFrom.current = clampPanel('details', width);
          }}
          onMove={(dx) => setWidth(clampPanel('details', dragFrom.current - dx))}
          onEnd={() => {}}
        />
      )}
      {note === 'workingTreeClean' ? (
        <PanelNote>{t('workingTree.clean')}</PanelNote>
      ) : note === 'noCommits' ? (
        <PanelNote>{t('repo.emptyHint')}</PanelNote>
      ) : (
        children
      )}
    </aside>
  );
}
