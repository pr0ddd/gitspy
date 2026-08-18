import { useEffect, useRef } from 'react';
import { usePref } from '@/shared/lib/prefs';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icons';
import { SectionHeader } from '@/shared/ui/parts';
import { rovingTabIndex } from '@/shared/lib/roving';
import { buildFileTree } from '@/features/fileTree';
import type { StatusEntryView } from '@/shared/api/types';
import { FileRow, type RowAction } from './FileRow';
import { shownOrder, type FileView } from './order';
import { TreeRows, type RowPlace } from './TreeRows';
import { ALWAYS_OPEN, type Folds } from './useFolds';

export function Section({
  id,
  title,
  count,
  action,
  actionTone,
  entries,
  rowAction,
  view,
  descending,
  selectedPath,
  folds = ALWAYS_OPEN,
  last,
  onAll,
  onRow,
  onOpen,
  onMenu,
}: {
  id: 'conflicted' | 'unstaged' | 'resolved' | 'staged';
  title: string;
  count: number;
  action: string;
  actionTone: 'added' | 'deleted';
  entries: StatusEntryView[];
  rowAction: RowAction;
  view: FileView;
  descending: boolean;
  selectedPath: string | null;
  folds?: Folds;
  last?: boolean;
  onAll: () => void;
  onRow: (path: string) => void;
  onOpen: (entry: StatusEntryView) => void;
  onMenu?: (entry: StatusEntryView) => void;
}) {
  const order = shownOrder(entries, view, descending);
  const indexByPath = new Map(order.map((entry, index) => [entry.path, index]));
  const at = selectedPath === null ? -1 : (indexByPath.get(selectedPath) ?? -1);
  const chosen = useRef<HTMLElement | null>(null);

  const { reveal } = folds;

  useEffect(() => {
    if (view === 'tree' && selectedPath) reveal(selectedPath);
  }, [view, selectedPath, reveal]);

  useEffect(() => {
    chosen.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedPath]);

  const place: RowPlace = { selectedPath, at, indexByPath, rowRef: chosen };
  const [collapsed, setCollapsed] = usePref(`workingTree.collapsed.${id}`, false);

  return (
    <div className={cn('flex min-h-0 flex-col', collapsed ? 'shrink-0' : 'flex-1')}>
      <SectionHeader band overList>
        <Button
          variant="heading"
          size="xs"
          aria-expanded={!collapsed}
          className="-ml-2 min-w-0 flex-1 justify-start"
          onClick={() => setCollapsed(!collapsed)}
        >
          <Icon.chevron className={cn('size-3 transition-transform', !collapsed && 'rotate-90')} />
          <span className="truncate">{title}</span>
          <span className="font-normal tabular-nums">({count})</span>
        </Button>
        {count > 0 ? (
          <Button
            variant={actionTone === 'added' ? 'outlineAdded' : 'outlineDeleted'}
            size="2xs"
            onClick={onAll}
          >
            {action}
          </Button>
        ) : null}
      </SectionHeader>
      <div
        className={cn(
          'min-h-0 flex-1 overflow-y-scroll pl-2.5',
          last && 'border-b',
          collapsed && 'hidden',
        )}
      >
        <div role="listbox" aria-label={title}>
          {view === 'tree' ? (
            <TreeRows
              nodes={buildFileTree(entries, descending)}
              depth={0}
              rowAction={rowAction}
              place={place}
              folds={folds}
              onRow={onRow}
              onOpen={onOpen}
              onMenu={onMenu}
            />
          ) : (
            order.map((entry, index) => (
              <FileRow
                key={`${entry.staged}:${entry.path}`}
                entry={entry}
                action={rowAction}
                selected={entry.path === selectedPath}
                tabIndex={rovingTabIndex(at, index)}
                rowRef={entry.path === selectedPath ? chosen : undefined}
                onAct={() => onRow(entry.path)}
                onOpen={() => onOpen(entry)}
                onMenu={onMenu}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
