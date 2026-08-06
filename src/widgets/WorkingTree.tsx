import { ask } from '@tauri-apps/plugin-dialog';
import { usePref } from '@/prefs';
import * as ipc from '@/ipc';
import { buildFileMenu, type MenuAction } from '@/features/menus';
import { showNativeMenu } from '@/features/menus';
import { notifyError } from '@/toast';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Hint } from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/icons';
import { FilePath, ListRow, PanelBar, SectionHeader, StatusBadge } from '@/parts';
import { buildFileTree, sortedByPath, type FileNode } from '@/features/fileTree';
import { useGenerateCommit } from '@/features/repo';
import type { Operation, PathOperation, StatusEntryView, WorkingTreeView } from '@/types';

export type PreviousCommit = { readonly subject: string; readonly body: string };

type Props = {
  repo: string;
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
  onConfirm: (operation: Operation) => void;
  onOpen: (path: string, status: string, staged: boolean) => void;
  onCopy: (text: string) => void;
  onHistory: (path: string) => void;
};


function FileRow({
  entry,
  action,
  name,
  depth,
  onAct,
  onOpen,
  onMenu,
}: {
  entry: StatusEntryView;
  action: string;
  name?: string;
  depth?: number;
  onAct: () => void;
  onOpen: () => void;
  onMenu?: (entry: StatusEntryView) => void;
}) {
  return (
    <li>
      <ListRow
        as="div"
        depth={depth}
        title={entry.path}
        onClick={onOpen}
        onContextMenu={onMenu ? () => onMenu(entry) : undefined}
      >
        {entry.letter === 'U' ? (
          <Icon.conflict className="text-conflict size-3 shrink-0" />
        ) : (
          <StatusBadge letter={entry.letter} />
        )}
        {name === undefined ? <FilePath path={entry.path} /> : <span className="truncate">{name}</span>}
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

type FileView = 'path' | 'tree';

function TreeRows({
  nodes,
  depth,
  rowAction,
  onRow,
  onOpen,
  onMenu,
}: {
  nodes: FileNode[];
  depth: number;
  rowAction: string;
  onRow: (path: string) => void;
  onOpen: (entry: StatusEntryView) => void;
  onMenu?: (entry: StatusEntryView) => void;
}) {
  return (
    <>
      {nodes.map((node) =>
        node.kind === 'folder' ? (
          <li key={node.path}>
            <ListRow as="div" depth={depth}>
              <Icon.folder className="text-faint size-3 shrink-0" />
              <span className="text-muted-foreground truncate">{node.name}</span>
            </ListRow>
            <ul>
              <TreeRows
                nodes={node.children}
                depth={depth + 1}
                rowAction={rowAction}
                onRow={onRow}
                onOpen={onOpen}
                onMenu={onMenu}
              />
            </ul>
          </li>
        ) : (
          <FileRow
            key={`${node.entry.staged}:${node.path}`}
            entry={node.entry}
            action={rowAction}
            name={node.name}
            depth={depth}
            onAct={() => onRow(node.path)}
            onOpen={() => onOpen(node.entry)}
            onMenu={onMenu}
          />
        ),
      )}
    </>
  );
}

function Section({
  title,
  count,
  action,
  entries,
  rowAction,
  view,
  descending,
  onAll,
  onRow,
  onOpen,
  onMenu,
}: {
  title: string;
  count: number;
  action: string;
  entries: StatusEntryView[];
  rowAction: string;
  view: FileView;
  descending: boolean;
  onAll: () => void;
  onRow: (path: string) => void;
  onOpen: (entry: StatusEntryView) => void;
  onMenu?: (entry: StatusEntryView) => void;
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
          {view === 'tree' ? (
            <TreeRows
              nodes={buildFileTree(entries, descending)}
              depth={0}
              rowAction={rowAction}
              onRow={onRow}
              onOpen={onOpen}
              onMenu={onMenu}
            />
          ) : (
            sortedByPath(entries, descending).map((entry) => (
              <FileRow
                key={`${entry.staged}:${entry.path}`}
                entry={entry}
                action={rowAction}
                onAct={() => onRow(entry.path)}
                onOpen={() => onOpen(entry)}
                onMenu={onMenu}
              />
            ))
          )}
        </ul>
      </div>
    </>
  );
}

function PanelHead({
  count,
  branch,
  busy,
  view,
  descending,
  onDiscardAll,
  onView,
  onOrder,
}: {
  count: number;
  branch: string | null;
  busy: boolean;
  view: FileView;
  descending: boolean;
  onDiscardAll: () => void;
  onView: (next: FileView) => void;
  onOrder: (descending: boolean) => void;
}) {
  const { t } = useTranslation();
  const Sort = descending ? Icon.sortZA : Icon.sortAZ;

  return (
    <>
      <PanelBar>
        <Hint text={t('workingTree.discardAll')}>
          <Button
            variant="destructiveSoft"
            size="icon-xs"
            aria-label={t('workingTree.discardAll')}
            disabled={busy || count === 0}
            onClick={onDiscardAll}
          >
            <Icon.discard className="size-3" />
          </Button>
        </Hint>
        <span className="text-muted-foreground flex min-w-0 flex-1 items-center justify-center gap-1.5">
          <span className="truncate">{t('workingTree.changesOn', { count })}</span>
          {branch ? (
            <Badge className="bg-fill-2 text-muted-foreground text-2xs shrink-0 gap-1.5 rounded-md px-2 py-0.5">
              <Icon.branch className="size-3" />
              <span className="truncate">{branch}</span>
            </Badge>
          ) : null}
        </span>
      </PanelBar>

      <PanelBar className="border-t-0">
        <Hint text={t(descending ? 'workingTree.sortZA' : 'workingTree.sortAZ')}>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t(descending ? 'workingTree.sortZA' : 'workingTree.sortAZ')}
            onClick={() => onOrder(!descending)}
          >
            <Sort className="size-3.5" />
          </Button>
        </Hint>
        <span className="flex-1" />
        <Hint text={t('workingTree.viewPath')}>
          <Button
            variant={view === 'path' ? 'secondary' : 'ghost'}
            size="icon-xs"
            aria-label={t('workingTree.viewPath')}
            onClick={() => onView('path')}
          >
            <Icon.viewPath className="size-3.5" />
          </Button>
        </Hint>
        <Hint text={t('workingTree.viewTree')}>
          <Button
            variant={view === 'tree' ? 'secondary' : 'ghost'}
            size="icon-xs"
            aria-label={t('workingTree.viewTree')}
            onClick={() => onView('tree')}
          >
            <Icon.viewTree className="size-3.5" />
          </Button>
        </Hint>
      </PanelBar>
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
  generateHint,
  generateReady,
  generating,
  onGenerate,
}: {
  message: string;
  description: string;
  onMessage: (text: string) => void;
  onDescription: (text: string) => void;
  onHotkey: (e: React.KeyboardEvent) => void;
  generateHint: string;
  generateReady: boolean;
  generating: boolean;
  onGenerate: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="relative">
        <input
          value={message}
          onChange={(e) => onMessage(e.target.value)}
          onKeyDown={onHotkey}
          placeholder={t('workingTree.messagePlaceholder')}
          className="bg-fill-1 text-foreground placeholder:text-faint focus:bg-fill-2 w-full rounded-md py-1.5 pl-2.5 pr-8 text-sm outline-none"
        />
        <Hint text={generateHint}>
          <span className="absolute top-1/2 right-1 -translate-y-1/2">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t('workingTree.generate')}
              disabled={!generateReady || generating}
              onClick={onGenerate}
            >
              {generating ? (
                <Icon.waiting className="size-3.5 animate-spin" />
              ) : (
                <Icon.sparkle className="size-3.5" />
              )}
            </Button>
          </span>
        </Hint>
      </div>
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
        view="path"
        descending={false}
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
            view="path"
            descending={false}
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
        view="path"
        descending={false}
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
          generateHint={t('workingTree.generateNeedsStaged')}
          generateReady={false}
          generating={false}
          onGenerate={() => {}}
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
    repo,
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
    onConfirm,
    onOpen,
    onCopy,
    onHistory,
  } = props;
  const { t } = useTranslation();

  const openFileMenu = (entry: StatusEntryView) => {
    showNativeMenu(
      buildFileMenu({ path: entry.path, staged: entry.staged }),
      (key, params) => t(key as 'menu.copyPath', params),
      (action: MenuAction) => {
        if (action.kind === 'pathRun') onRun(action.operation);
        else if (action.kind === 'run') props.onOperation(action.operation);
        else if (action.kind === 'copy') onCopy(action.text);
        else if (action.kind === 'ignore') void ipc.appendIgnore(repo, action.pattern).catch(notifyError);
        else if (action.kind === 'history') onHistory(action.path);
        else if (action.kind === 'openFile') void ipc.openPath(repo, action.path).catch(notifyError);
        else if (action.kind === 'reveal') void ipc.revealPath(repo, action.path).catch(notifyError);
        else if (action.kind === 'copyPatch')
          void ipc
            .workingTreeHunks(repo, action.path, action.staged)
            .then(onCopy)
            .catch(notifyError);
        else if (action.kind === 'deleteFile')
          void ask(t('menu.deleteFileAsk', { path: action.path }), { kind: 'warning' }).then(
            (sure) => {
              if (sure) void ipc.removePath(repo, action.path).catch(notifyError);
            },
          );
      },
    ).catch(notifyError);
  };
  const [view, setView] = usePref<FileView>('workingTree.view', 'path');
  const [descending, setDescending] = usePref('workingTree.sortDescending', false);

  if (tree.merging && tree.conflicts > 0) return <MergingPanel {...props} />;

  const staged = tree.entries.filter((e) => e.staged);
  const unstaged = tree.entries.filter((e) => !e.staged);
  const committable = message.trim().length > 0 && (staged.length > 0 || amend);
  const [pushAfter, setPushAfter] = usePref<boolean>('commit.push', false);

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

  const ai = useGenerateCommit({
    repo,
    hasStaged: staged.length > 0,
    onDraft: (summary, body) => {
      onMessage(summary);
      onDescription(body);
    },
  });
  const generateHint =
    ai.readiness === 'needsStaged'
      ? t('workingTree.generateNeedsStaged')
      : ai.readiness === 'needsSetup'
        ? t('workingTree.generateNeedsSetup')
        : t('workingTree.generate');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHead
        count={tree.entries.length}
        branch={tree.branch}
        busy={busy}
        view={view}
        descending={descending}
        onDiscardAll={() => onConfirm({ kind: 'discardAll' })}
        onView={setView}
        onOrder={setDescending}
      />

      <Section
        title={t('workingTree.unstaged')}
        count={unstaged.length}
        action={t('workingTree.stageAll')}
        entries={unstaged}
        rowAction={t('workingTree.stage')}
        view={view}
        descending={descending}
        onMenu={openFileMenu}
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
        view={view}
        descending={descending}
        onMenu={openFileMenu}
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
          generateHint={generateHint}
          generateReady={ai.readiness === 'ready'}
          generating={ai.generating}
          onGenerate={ai.generate}
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
              aria-label={t('workingTree.amend')}
            />
            {t('workingTree.amend')}
          </label>
        )}
        <label className="text-muted-foreground flex items-center gap-2 text-xs">
          <Checkbox
            checked={pushAfter}
            onCheckedChange={(next) => setPushAfter(next === true)}
            aria-label={t('workingTree.pushAfter')}
          />
          {t('workingTree.pushAfter')}
        </label>
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
