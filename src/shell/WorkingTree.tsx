import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { shortenDirectory, splitPath } from '../paths';
import type { PathOperation, StatusEntryView, WorkingTreeView } from '../types';

type Props = {
  tree: WorkingTreeView;
  busy: boolean;
  onRun: (operation: PathOperation) => void;
  onOpen: (path: string, status: string, staged: boolean) => void;
};

const STATUS_STYLE: Record<string, string> = {
  A: 'text-added',
  M: 'text-modified',
  D: 'text-deleted',
  R: 'text-renamed',
  C: 'text-renamed',
  T: 'text-modified',
  U: 'text-conflict',
  '?': 'text-added',
};

function FileRow({
  entry,
  action,
  onAct,
  onOpen,
}: {
  entry: StatusEntryView;
  action: string;
  onAct: () => void;
  onOpen: () => void;
}) {
  const { directory, name } = splitPath(entry.path);
  return (
    <li>
      <div
        onClick={onOpen}
        className="group hover:bg-surface-hover flex h-6 cursor-pointer items-baseline gap-1.5 rounded-sm px-1 font-mono text-xs"
      >
        <span className={cn('w-3 shrink-0 text-center', STATUS_STYLE[entry.letter])}>
          {entry.letter}
        </span>
        <span className="text-muted-foreground min-w-0 flex-1 shrink-[100] truncate text-left [direction:rtl]">
          {'\u200e' + shortenDirectory(directory, 64) + '\u200e'}
        </span>
        <span className="min-w-16 truncate" title={entry.path}>
          {name}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onAct();
          }}
          className="ml-auto h-5 shrink-0 px-1.5 text-2xs opacity-0 transition-opacity group-hover:opacity-100"
        >
          {action}
        </Button>
      </div>
    </li>
  );
}

function Section({
  title,
  count,
  action,
  entries,
  rowAction,
  onAll,
  onRow,
  onOpen,
}: {
  title: string;
  count: number;
  action: string;
  entries: StatusEntryView[];
  rowAction: string;
  onAll: () => void;
  onRow: (path: string) => void;
  onOpen: (entry: StatusEntryView) => void;
}) {
  return (
    <>
      <div className="border-border flex h-7 shrink-0 items-center gap-2 border-b px-3">
        <span className="text-muted-foreground flex-1 text-xs tracking-wide uppercase">
          {title}
        </span>
        <span className="text-muted-foreground tabular-nums">{count}</span>
        {count > 0 ? (
          <Button variant="outline" size="sm" onClick={onAll} className="h-5 px-1.5 text-2xs">
            {action}
          </Button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ul className="space-y-0.5 p-1">
          {entries.map((entry) => (
            <FileRow
              key={`${entry.staged}:${entry.path}`}
              entry={entry}
              action={rowAction}
              onAct={() => onRow(entry.path)}
              onOpen={() => onOpen(entry)}
            />
          ))}
        </ul>
      </div>
    </>
  );
}

export function WorkingTree({ tree, busy, onRun, onOpen }: Props) {
  const { t } = useTranslation();
  const staged = tree.entries.filter((e) => e.staged);
  const unstaged = tree.entries.filter((e) => !e.staged);

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', busy && 'pointer-events-none opacity-60')}>
      <Section
        title={t('workingTree.unstaged')}
        count={unstaged.length}
        action={t('workingTree.stageAll')}
        entries={unstaged}
        rowAction={t('workingTree.stage')}
        onAll={() => onRun({ kind: 'stageAll' })}
        onRow={(path) => onRun({ kind: 'stage', paths: [path] })}
        onOpen={(entry) => onOpen(entry.path, entry.letter, false)}
      />

      <Separator />

      <Section
        title={t('workingTree.staged')}
        count={staged.length}
        action={t('workingTree.unstageAll')}
        entries={staged}
        rowAction={t('workingTree.unstage')}
        onAll={() => onRun({ kind: 'unstageAll' })}
        onRow={(path) => onRun({ kind: 'unstage', paths: [path] })}
        onOpen={(entry) => onOpen(entry.path, entry.letter, true)}
      />
    </div>
  );
}
