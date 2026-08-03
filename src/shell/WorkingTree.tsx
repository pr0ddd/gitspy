import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { FilePath, ListRow, SectionHeader } from './parts';
import type { PathOperation, StatusEntryView, WorkingTreeView } from '../types';

export type PreviousCommit = { readonly subject: string; readonly body: string };

type Props = {
  tree: WorkingTreeView;
  busy: boolean;
  message: string;
  description: string;
  amend: boolean;
  previous: PreviousCommit | null;
  onMessage: (text: string) => void;
  onDescription: (text: string) => void;
  onAmend: (next: boolean) => void;
  onCommit: () => void;
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
  return (
    <li>
      <ListRow as="div" hint={entry.path} onClick={onOpen}>
        <span className={cn('w-3 shrink-0 text-center', STATUS_STYLE[entry.letter])}>
          {entry.letter}
        </span>
        <FilePath path={entry.path} />
        <Button
          variant="ghost"
          size="2xs"
          reveal
          onClick={(e) => {
            e.stopPropagation();
            onAct();
          }}
          className="ml-auto"
        >
          {action}
        </Button>
      </ListRow>
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
      <SectionHeader border="bottom">
        <span className="min-w-0 flex-1 truncate text-left">{title}</span>
        <span className="shrink-0 tabular-nums">{count}</span>
        {count > 0 ? (
          <Button variant="outline" size="2xs" onClick={onAll}>
            {action}
          </Button>
        ) : null}
      </SectionHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ul>
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

export function WorkingTree({
  tree,
  busy,
  message,
  description,
  amend,
  previous,
  onMessage,
  onDescription,
  onAmend,
  onCommit,
  onRun,
  onOpen,
}: Props) {
  const { t } = useTranslation();
  const staged = tree.entries.filter((e) => e.staged);
  const unstaged = tree.entries.filter((e) => !e.staged);
  const committable = message.trim().length > 0 && (staged.length > 0 || amend);

  const toggleAmend = (next: boolean) => {
    if (next && previous) {
      if (!message.trim()) onMessage(previous.subject);
      if (!description.trim()) onDescription(previous.body);
    }
    onAmend(next);
  };

  const commitOnHotkey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && committable) onCommit();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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

      <Separator />

      <div className="flex shrink-0 flex-col gap-2 p-3">
        <input
          value={message}
          onChange={(e) => onMessage(e.target.value)}
          onKeyDown={commitOnHotkey}
          placeholder={t('workingTree.messagePlaceholder')}
          className="border-input bg-surface-raised text-foreground placeholder:text-muted-foreground focus:border-ring w-full rounded-sm border px-2 py-1.5 text-sm outline-none"
        />
        <textarea
          value={description}
          onChange={(e) => onDescription(e.target.value)}
          onKeyDown={commitOnHotkey}
          placeholder={t('workingTree.descriptionPlaceholder')}
          rows={3}
          className="border-input bg-surface-raised text-foreground placeholder:text-muted-foreground focus:border-ring w-full resize-none rounded-sm border px-2 py-1.5 text-sm outline-none"
        />
        <label
          className={cn(
            'text-muted-foreground flex items-center gap-2 text-xs',
            !previous && 'opacity-50',
          )}
        >
          <Checkbox
            checked={amend}
            disabled={!previous}
            onCheckedChange={(next) => toggleAmend(next === true)}
          />
          {t('workingTree.amend')}
        </label>
        <Button disabled={!committable} onClick={onCommit}>
          {t('workingTree.commit')}
        </Button>
      </div>
    </div>
  );
}
