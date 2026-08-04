import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Icon } from '../icons';
import { FilePath, ListRow, SectionHeader } from './parts';
import type { Operation, PathOperation, StatusEntryView, WorkingTreeView } from '../types';

export type PreviousCommit = { readonly subject: string; readonly body: string };

type Props = {
  tree: WorkingTreeView;
  busy: boolean;
  committing: boolean;
  message: string;
  description: string;
  amend: boolean;
  previous: PreviousCommit | null;
  onMessage: (text: string) => void;
  onDescription: (text: string) => void;
  onAmend: (next: boolean) => void;
  onCommit: () => void;
  onRun: (operation: PathOperation) => void;
  onOperation: (operation: Operation) => void;
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
        {entry.letter === 'U' ? (
          <Icon.conflict className="text-conflict size-3 shrink-0" />
        ) : (
          <span className={cn('w-3 shrink-0 text-center', STATUS_STYLE[entry.letter])}>
            {entry.letter}
          </span>
        )}
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
      <SectionHeader>
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

function MergeHeading({ from, into }: { from: string | null; into: string | null }) {
  const { t } = useTranslation();
  return (
    <div className="text-muted-foreground flex h-8 shrink-0 items-center justify-center gap-1.5 text-xs">
      {t('workingTree.merging')}
      {from ? (
        <Badge className="bg-fill-2 text-muted-foreground text-2xs gap-1.5 rounded-md px-2 py-0.5">
          {from.includes('/') ? <Icon.remote className="size-3" /> : <Icon.branch className="size-3" />}
          {from}
        </Badge>
      ) : null}
      {t('workingTree.into')}
      {into ? (
        <Badge className="bg-fill-2 text-muted-foreground text-2xs gap-1.5 rounded-md px-2 py-0.5">
          <Icon.branch className="size-3" />
          {into}
        </Badge>
      ) : null}
    </div>
  );
}

function MessageFields({
  message,
  description,
  onMessage,
  onDescription,
  onHotkey,
}: {
  message: string;
  description: string;
  onMessage: (text: string) => void;
  onDescription: (text: string) => void;
  onHotkey: (e: React.KeyboardEvent) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <input
        value={message}
        onChange={(e) => onMessage(e.target.value)}
        onKeyDown={onHotkey}
        placeholder={t('workingTree.messagePlaceholder')}
        className="bg-fill-1 text-foreground placeholder:text-faint focus:bg-fill-2 w-full rounded-md px-2.5 py-1.5 text-sm outline-none"
      />
      <textarea
        value={description}
        onChange={(e) => onDescription(e.target.value)}
        onKeyDown={onHotkey}
        placeholder={t('workingTree.descriptionPlaceholder')}
        rows={3}
        className="bg-fill-1 text-foreground placeholder:text-faint focus:bg-fill-2 w-full resize-none rounded-md px-2.5 py-1.5 text-sm outline-none"
      />
    </>
  );
}

function MergingPanel({
  tree,
  busy,
  message,
  description,
  onMessage,
  onDescription,
  onCommit,
  onRun,
  onOperation,
  onOpen,
}: Omit<Props, 'amend' | 'previous' | 'onAmend'>) {
  const { t } = useTranslation();
  const conflicted = tree.entries.filter((e) => !e.staged && e.letter === 'U');
  const pending = tree.entries.filter((e) => !e.staged && e.letter !== 'U');
  const resolved = tree.entries.filter((e) => e.staged);
  const committable = message.trim().length > 0 && conflicted.length === 0;

  const commitOnHotkey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && committable) onCommit();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {conflicted.length > 0 ? (
        <div className="text-conflict flex h-8 shrink-0 items-center justify-center gap-1.5 text-xs font-medium">
          <Icon.conflict className="size-3.5" />
          {t('workingTree.mergeDetected')}
        </div>
      ) : null}
      <MergeHeading from={tree.merging?.from ?? null} into={tree.branch} />

      <Section
        title={t('workingTree.conflicted')}
        count={conflicted.length}
        action={t('workingTree.markAllResolved')}
        entries={conflicted}
        rowAction={t('conflict.markResolved')}
        onAll={() => onRun({ kind: 'stage', paths: conflicted.map((e) => e.path) })}
        onRow={(path) => onRun({ kind: 'stage', paths: [path] })}
        onOpen={(entry) => onOpen(entry.path, entry.letter, false)}
      />

      {pending.length > 0 ? (
        <>
          <Separator />
          <Section
            title={t('workingTree.unstaged')}
            count={pending.length}
            action={t('workingTree.stageAll')}
            entries={pending}
            rowAction={t('workingTree.stage')}
            onAll={() => onRun({ kind: 'stage', paths: pending.map((e) => e.path) })}
            onRow={(path) => onRun({ kind: 'stage', paths: [path] })}
            onOpen={(entry) => onOpen(entry.path, entry.letter, false)}
          />
        </>
      ) : null}

      <Separator />

      <Section
        title={t('workingTree.resolved')}
        count={resolved.length}
        action={t('conflict.unresolveAll')}
        entries={resolved}
        rowAction={t('conflict.unresolve')}
        onAll={() => onRun({ kind: 'unresolve', paths: resolved.map((e) => e.path) })}
        onRow={(path) => onRun({ kind: 'unresolve', paths: [path] })}
        onOpen={(entry) => onOpen(entry.path, entry.letter, true)}
      />

      <Separator />

      <div className="flex shrink-0 flex-col gap-2 p-3">
        <MessageFields
          message={message}
          description={description}
          onMessage={onMessage}
          onDescription={onDescription}
          onHotkey={commitOnHotkey}
        />
        <div className="flex gap-2">
          <Button className="flex-1" disabled={!committable || busy} onClick={onCommit}>
            {t('workingTree.commitAndMerge')}
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => onOperation({ kind: 'mergeAbort' })}
          >
            {t('workingTree.abortMerge')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function WorkingTree(props: Props) {
  const {
    tree,
    busy,
    committing,
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
  } = props;
  const { t } = useTranslation();

  if (tree.merging && tree.conflicts > 0) return <MergingPanel {...props} />;

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
        <MessageFields
          message={message}
          description={description}
          onMessage={onMessage}
          onDescription={onDescription}
          onHotkey={commitOnHotkey}
        />
        {tree.merging ? null : (
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
        )}
        {tree.merging ? (
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={message.trim().length === 0 || busy}
              onClick={onCommit}
            >
              {committing ? <Icon.waiting className="size-3.5 animate-spin" /> : null}
              {t('workingTree.commitAndMerge')}
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => props.onOperation({ kind: 'mergeAbort' })}
            >
              {t('workingTree.abortMerge')}
            </Button>
          </div>
        ) : (
          <Button disabled={!committable || busy} onClick={onCommit}>
            {committing ? <Icon.waiting className="size-3.5 animate-spin" /> : null}
            {t('workingTree.commit')}
          </Button>
        )}
      </div>
    </div>
  );
}
