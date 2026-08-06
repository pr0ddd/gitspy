import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { clampPanel } from '@/resize';
import { PANEL_LIMITS } from '@/resize';
import { usePref } from '@/prefs';
import { PanelNote, ResizeGrip } from '@/parts';

type Props = {
  children: React.ReactNode;
  note: 'workingTreeClean' | 'noCommits' | null;
};

export function DetailsPane({ children, note }: Props) {
  const { t } = useTranslation();
  const [width, setWidth] = usePref<number>('details.width', PANEL_LIMITS.details.fallback);
  const dragFrom = useRef(width);

  return (
    <aside
      className="relative flex shrink-0 flex-col border-l"
      style={{ width: clampPanel('details', width) }}
    >
      <ResizeGrip
        edge="left"
        onStart={() => {
          dragFrom.current = clampPanel('details', width);
        }}
        onMove={(dx) => setWidth(clampPanel('details', dragFrom.current - dx))}
        onEnd={() => {}}
      />
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
