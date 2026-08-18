import { cn } from '@/shared/lib/utils';
import { Icon } from '@/shared/ui/icons';
import { ListRow, StatusBadge } from '@/shared/ui/parts';
import { rovingTabIndex } from '@/shared/lib/roving';
import { tallyByLetter, type FileNode } from '@/features/fileTree';
import type { StatusEntryView } from '@/shared/api/types';
import { FileRow, type RowAction } from './FileRow';
import type { Folds } from './useFolds';

export type RowPlace = {
  selectedPath: string | null;
  at: number;
  indexByPath: ReadonlyMap<string, number>;
  rowRef: React.Ref<HTMLElement>;
};

function FolderTally({ nodes }: { nodes: FileNode[] }) {
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1.5">
      {tallyByLetter(nodes).map(({ letter, count }) => (
        <span key={letter} className="flex items-center gap-1">
          <StatusBadge letter={letter} />
          <span className="text-muted-foreground tabular-nums">{count}</span>
        </span>
      ))}
    </span>
  );
}

export function TreeRows({
  nodes,
  depth,
  rowAction,
  place,
  folds,
  onRow,
  onOpen,
  onMenu,
}: {
  nodes: FileNode[];
  depth: number;
  rowAction: RowAction;
  place: RowPlace;
  folds: Folds;
  onRow: (path: string) => void;
  onOpen: (entry: StatusEntryView) => void;
  onMenu?: (entry: StatusEntryView) => void;
}) {
  return (
    <>
      {nodes.map((node) =>
        node.kind === 'folder' ? (
          <div key={node.path}>
            <ListRow
              as="div"
              depth={depth}
              aria-expanded={folds.isOpen(node.path)}
              onClick={() => folds.toggle(node.path)}
            >
              <Icon.chevron
                className={cn(
                  'text-muted-foreground size-3 shrink-0 transition-transform',
                  folds.isOpen(node.path) && 'rotate-90',
                )}
              />
              <Icon.folder className="text-muted-foreground size-3 shrink-0" />
              <span className="truncate">{node.name}</span>
              <FolderTally nodes={node.children} />
            </ListRow>
            {folds.isOpen(node.path) ? (
              <TreeRows
                nodes={node.children}
                depth={depth + 1}
                rowAction={rowAction}
                place={place}
                folds={folds}
                onRow={onRow}
                onOpen={onOpen}
                onMenu={onMenu}
              />
            ) : null}
          </div>
        ) : (
          <FileRow
            key={`${node.entry.staged}:${node.path}`}
            entry={node.entry}
            action={rowAction}
            name={node.name}
            depth={depth}
            selected={node.path === place.selectedPath}
            tabIndex={rovingTabIndex(place.at, place.indexByPath.get(node.path) ?? -1)}
            rowRef={node.path === place.selectedPath ? place.rowRef : undefined}
            onAct={() => onRow(node.path)}
            onOpen={() => onOpen(node.entry)}
            onMenu={onMenu}
          />
        ),
      )}
    </>
  );
}
