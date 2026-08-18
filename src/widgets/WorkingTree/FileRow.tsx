import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icons';
import { FilePath, ListRow, StatusBadge } from '@/shared/ui/parts';
import type { StatusEntryView } from '@/shared/api/types';

export type RowAction = { label: string; icon: 'down' | 'up' };

export function FileRow({
  entry,
  action,
  name,
  depth,
  selected,
  tabIndex,
  rowRef,
  onAct,
  onOpen,
  onMenu,
}: {
  entry: StatusEntryView;
  action: RowAction;
  name?: string;
  depth?: number;
  selected: boolean;
  tabIndex: 0 | -1;
  rowRef?: React.Ref<HTMLElement>;
  onAct: () => void;
  onOpen: () => void;
  onMenu?: (entry: StatusEntryView) => void;
}) {
  return (
    <ListRow
      as="div"
      depth={depth}
      hint={entry.path}
      hintSide="left"
      selected={selected}
      tabIndex={tabIndex}
      rowRef={rowRef}
      onClick={onOpen}
      onContextMenu={onMenu ? () => onMenu(entry) : undefined}
      tail={
        <Button
          variant={action.icon === 'down' ? 'outlineAdded' : 'outlineDeleted'}
          size="2xs"
          onClick={(e) => {
            e.stopPropagation();
            onAct();
          }}
        >
          {action.label}
        </Button>
      }
    >
      {entry.letter === 'U' ? (
        <Icon.conflict className="text-conflict size-3 shrink-0" />
      ) : (
        <StatusBadge letter={entry.letter} />
      )}
      {name === undefined ? (
        <FilePath path={entry.path} />
      ) : (
        <span className="truncate">{name}</span>
      )}
    </ListRow>
  );
}
