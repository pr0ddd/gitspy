import { useCallback, useEffect, useRef, useState } from 'react';
import { usePref } from '@/prefs';
import * as ipc from '@/ipc';
import { buildFileMenu, type MenuAction } from '@/features/menus';
import { showNativeMenu } from '@/features/menus';
import { notifyError } from '@/toast';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Hint } from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { Icon } from '@/icons';
import { Chip, FilePath, ListRow, PanelBar, SectionHeader, StatusBadge } from '@/parts';
import {
  buildFileTree,
  filesOf,
  foldersOf,
  sortedByPath,
  tallyByLetter,
  type FileNode,
} from '@/features/fileTree';
import { subjectLeft, useGenerateCommit, useRepoWork } from '@/features/repo';
import { pickAfterMove, samePick, type Confirmation, type Picked } from '@/entities/repo';
import { useCommands } from '@/features/keyboard';
import { rovingTabIndex, stepped } from '@/roving';
import type { Operation, PathOperation, StatusEntryView, WorkingTreeView } from '@/types';

export type PreviousCommit = { readonly subject: string; readonly body: string };

type Props = {
  repo: string;
  tree: WorkingTreeView;
  message: string;
  description: string;
  amend: boolean;
  previous: PreviousCommit | null;
  picked: Picked | null;
  diffOpen: boolean;
  onPick: (picked: Picked | null) => void;
  onMessage: (text: string) => void;
  onDescription: (text: string) => void;
  onAmend: (next: boolean) => void;
  onCommit: () => void;
  onRun: (operation: PathOperation) => Promise<WorkingTreeView | null>;
  onOperation: (operation: Operation) => void;
  onConfirm: (confirmation: Confirmation) => void;
  onOpen: (path: string, status: string, staged: boolean) => void;
  onCopy: (text: string) => void;
  onHistory: (path: string) => void;
};

const shownOrder = (
  entries: readonly StatusEntryView[],
  view: FileView,
  descending: boolean,
): StatusEntryView[] =>
  view === 'tree' ? filesOf(buildFileTree(entries, descending)) : sortedByPath(entries, descending);

function FileRow({
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
  action: { label: string; icon: 'down' | 'up' };
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

type FileView = 'path' | 'tree';

type RowPlace = {
  selectedPath: string | null;
  at: number;
  indexByPath: ReadonlyMap<string, number>;
  rowRef: React.Ref<HTMLElement>;
};

type Folds = {
  isOpen: (path: string) => boolean;
  toggle: (path: string) => void;
  reveal: (filePath: string) => void;
};

const ALWAYS_OPEN: Folds = { isOpen: () => true, toggle: () => {}, reveal: () => {} };

const ancestorsOf = (filePath: string): string[] =>
  filePath
    .split('/')
    .slice(0, -1)
    .map((_, at, all) => all.slice(0, at + 1).join('/'));

function useFolds(entries: readonly StatusEntryView[]): Folds & {
  allClosed: boolean;
  foldAll: (open: boolean) => void;
} {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());

  const widen = useCallback((paths: readonly string[]) => {
    setOpen((was) => {
      if (paths.every((path) => was.has(path))) return was;
      const next = new Set(was);
      for (const path of paths) next.add(path);
      return next;
    });
  }, []);

  const toggle = useCallback((path: string) => {
    setOpen((was) => {
      const next = new Set(was);
      if (!next.delete(path)) next.add(path);
      return next;
    });
  }, []);

  const reveal = useCallback((filePath: string) => widen(ancestorsOf(filePath)), [widen]);

  const foldAll = useCallback(
    (unfold: boolean) => setOpen(unfold ? new Set(foldersOf(buildFileTree(entries))) : new Set()),
    [entries],
  );

  return {
    isOpen: useCallback((path: string) => open.has(path), [open]),
    toggle,
    reveal,
    allClosed: open.size === 0,
    foldAll,
  };
}

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

function TreeRows({
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
  rowAction: { label: string; icon: 'down' | 'up' };
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

function Section({
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
  rowAction: { label: string; icon: 'down' | 'up' };
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

function PanelHead({
  count,
  branch,
  busy,
  view,
  descending,
  allClosed,
  onDiscardAll,
  onView,
  onOrder,
  onFoldAll,
}: {
  count: number;
  branch: string | null;
  busy: boolean;
  view: FileView;
  descending: boolean;
  allClosed: boolean;
  onDiscardAll: () => void;
  onView: (next: FileView) => void;
  onOrder: (descending: boolean) => void;
  onFoldAll: (unfold: boolean) => void;
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
            <Chip filled title={branch}>
              <span className="truncate">{branch}</span>
            </Chip>
          ) : null}
        </span>
      </PanelBar>

      <PanelBar className="my-1 border-t-0">
        <span className="flex flex-1 items-center">
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
        </span>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={view}
          onValueChange={(next) => {
            if (next) onView(next as FileView);
          }}
        >
          <ToggleGroupItem value="path">
            <Icon.viewPath />
            {t('workingTree.viewPath')}
          </ToggleGroupItem>
          <ToggleGroupItem value="tree">
            <Icon.viewTree />
            {t('workingTree.viewTree')}
          </ToggleGroupItem>
        </ToggleGroup>
        <span className="flex flex-1 items-center justify-end">
          {view === 'tree' ? (
            <Button variant="action" size="xs" onClick={() => onFoldAll(allClosed)}>
              {t(allClosed ? 'workingTree.expandAll' : 'workingTree.collapseAll')}
            </Button>
          ) : null}
        </span>
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
        <Chip>
          {from.includes('/') ? (
            <Icon.remote className="size-3" />
          ) : (
            <Icon.branch className="size-3" />
          )}
          {from}
        </Chip>
      ) : null}
      {t('workingTree.into')}
      {into ? (
        <Chip head>
          <Icon.branch className="size-3" />
          {into}
        </Chip>
      ) : null}
    </div>
  );
}

function useWheelScrollsSideways(field: React.RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const el = field.current;
    if (!el) return;

    const roll = (e: WheelEvent) => {
      const push = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!push) return;
      const was = el.scrollLeft;
      el.scrollLeft = was + push;
      if (el.scrollLeft !== was) e.preventDefault();
    };

    el.addEventListener('wheel', roll, { passive: false });
    return () => el.removeEventListener('wheel', roll);
  }, [field]);
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
  const subject = useRef<HTMLInputElement>(null);
  useWheelScrollsSideways(subject);
  const left = subjectLeft(message);

  return (
    <div className="bg-control-fill space-y-1 rounded-md px-2.5 py-2">
      <div className="flex items-center gap-2">
        <Input
          ref={subject}
          bare
          value={message}
          onChange={(e) => onMessage(e.target.value)}
          onKeyDown={onHotkey}
          placeholder={t('workingTree.messagePlaceholder')}
          className="h-7 text-sm"
        />
        <span
          aria-label={t('workingTree.subjectLeft')}
          className={cn(
            'shrink-0 text-xs tabular-nums',
            left < 0 ? 'text-modified' : 'text-muted-foreground',
          )}
        >
          {left}
        </span>
        <Hint text={generateHint}>
          <span className="shrink-0">
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
      <Textarea
        bare
        value={description}
        onChange={(e) => onDescription(e.target.value)}
        onKeyDown={onHotkey}
        placeholder={t('workingTree.descriptionPlaceholder')}
        rows={3}
        className="max-h-40 overflow-y-auto"
      />
    </div>
  );
}

function MergingPanel({
  repo,
  tree,
  message,
  description,
  onMessage,
  onDescription,
  onCommit,
  onRun,
  onOperation,
  onOpen,
  picked,
  onPick,
}: Omit<Props, 'amend' | 'previous' | 'onAmend'>) {
  const { t } = useTranslation();
  const busy = useRepoWork(repo) !== null;
  const openAt = (entry: StatusEntryView) => {
    onPick({ path: entry.path, staged: entry.staged });
    onOpen(entry.path, entry.letter, entry.staged);
  };
  const conflicted = tree.entries.filter((e) => !e.staged && e.letter === 'U');
  const pending = tree.entries.filter((e) => !e.staged && e.letter !== 'U');
  const resolved = tree.entries.filter((e) => e.staged);
  const committable = message.trim().length > 0 && conflicted.length === 0;

  const commitOnHotkey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && committable) onCommit();
  };

  return (
    <div data-area="files" className="flex min-h-0 flex-1 flex-col">
      {conflicted.length > 0 ? (
        <div className="text-conflict flex h-8 shrink-0 items-center justify-center gap-1.5 text-xs font-medium">
          <Icon.conflict className="size-3.5" />
          {t('workingTree.mergeDetected')}
        </div>
      ) : null}
      <MergeHeading from={tree.merging?.from ?? null} into={tree.branch} />

      <Section
        id="conflicted"
        title={t('workingTree.conflicted')}
        count={conflicted.length}
        action={t('workingTree.markAllResolved')}
        actionTone="added"
        entries={conflicted}
        rowAction={{ label: t('conflict.markResolved'), icon: 'down' }}
        view="path"
        descending={false}
        selectedPath={picked && !picked.staged ? picked.path : null}
        onAll={() => onRun({ kind: 'stage', paths: conflicted.map((e) => e.path) })}
        onRow={(path) => onRun({ kind: 'stage', paths: [path] })}
        onOpen={openAt}
      />

      {pending.length > 0 ? (
        <>
          <Section
            id="unstaged"
            title={t('workingTree.unstaged')}
            count={pending.length}
            action={t('workingTree.stageAll')}
            actionTone="added"
            entries={pending}
            rowAction={{ label: t('workingTree.stage'), icon: 'down' }}
            view="path"
            descending={false}
            selectedPath={picked && !picked.staged ? picked.path : null}
            onAll={() => onRun({ kind: 'stage', paths: pending.map((e) => e.path) })}
            onRow={(path) => onRun({ kind: 'stage', paths: [path] })}
            onOpen={openAt}
          />
        </>
      ) : null}

      <Section
        id="resolved"
        last
        title={t('workingTree.resolved')}
        count={resolved.length}
        action={t('conflict.unresolveAll')}
        actionTone="deleted"
        entries={resolved}
        rowAction={{ label: t('conflict.unresolve'), icon: 'up' }}
        view="path"
        descending={false}
        selectedPath={picked?.staged ? picked.path : null}
        onAll={() => onRun({ kind: 'unresolve', paths: resolved.map((e) => e.path) })}
        onRow={(path) => onRun({ kind: 'unresolve', paths: [path] })}
        onOpen={openAt}
      />

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
    message,
    description,
    amend,
    previous,
    picked,
    diffOpen,
    onPick,
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
  const work = useRepoWork(repo);
  const busy = work !== null;
  const committing = work?.kind === 'commit';

  const openFileMenu = (entry: StatusEntryView) => {
    showNativeMenu(
      buildFileMenu({ path: entry.path, staged: entry.staged }),
      (key, params) => t(key as 'menu.copyPath', params),
      (action: MenuAction) => {
        if (action.kind === 'pathRun') onRun(action.operation);
        else if (action.kind === 'run') props.onOperation(action.operation);
        else if (action.kind === 'copy') onCopy(action.text);
        else if (action.kind === 'ignore')
          void ipc.appendIgnore(repo, action.pattern).catch(notifyError);
        else if (action.kind === 'history') onHistory(action.path);
        else if (action.kind === 'openFile')
          void ipc.openPath(repo, action.path).catch(notifyError);
        else if (action.kind === 'reveal')
          void ipc.revealPath(repo, action.path).catch(notifyError);
        else if (action.kind === 'copyPatch')
          void ipc
            .workingTreeHunks(repo, action.path, action.staged)
            .then(onCopy)
            .catch(notifyError);
        else if (action.kind === 'confirm') onConfirm(action.confirmation);
      },
    ).catch(notifyError);
  };
  const [view, setView] = usePref<FileView>('workingTree.view', 'path');
  const [descending, setDescending] = usePref('workingTree.sortDescending', false);
  const folds = useFolds(tree.entries);
  const [pushAfter, setPushAfter] = usePref<boolean>('commit.push', false);

  const staged = tree.entries.filter((e) => e.staged);
  const unstaged = tree.entries.filter((e) => !e.staged);
  const committable = message.trim().length > 0 && (staged.length > 0 || amend);

  const ai = useGenerateCommit({
    repo,
    hasStaged: staged.length > 0,
    onDraft: (summary, body) => {
      onMessage(summary);
      onDescription(body);
    },
  });

  const unstagedOrder = shownOrder(unstaged, view, descending);
  const stagedOrder = shownOrder(staged, view, descending);
  const order: Picked[] = [
    ...unstagedOrder.map((entry) => ({ path: entry.path, staged: false })),
    ...stagedOrder.map((entry) => ({ path: entry.path, staged: true })),
  ];
  const at = order.findIndex((seat) => samePick(seat, picked));

  const moveTo = (index: number) => {
    const next = order[index];
    if (!next) return;
    onPick(next);
    const entry = tree.entries.find((seat) => samePick(seat, next));
    if (diffOpen && entry) onOpen(entry.path, entry.letter, entry.staged);
  };

  const openAt = (entry: StatusEntryView) => {
    onPick({ path: entry.path, staged: entry.staged });
    onOpen(entry.path, entry.letter, entry.staged);
  };

  const moveAcross = (
    path: string,
    fromStaged: boolean,
    from: readonly StatusEntryView[],
    operation: PathOperation,
  ) => {
    void onRun(operation).then((fresh) => {
      if (!fresh) return;
      const seat = pickAfterMove(
        from.map((entry) => entry.path),
        path,
        fromStaged,
        fresh.entries,
      );
      onPick(seat);
      if (!diffOpen || !seat) return;
      const shown = fresh.entries.find((entry) => samePick(entry, seat));
      if (shown) onOpen(shown.path, shown.letter, shown.staged);
    });
  };

  const stageAt = (path: string) =>
    moveAcross(path, false, unstagedOrder, { kind: 'stage', paths: [path] });

  const unstageAt = (path: string) =>
    moveAcross(path, true, stagedOrder, { kind: 'unstage', paths: [path] });

  const openPicked = () => {
    const entry =
      tree.entries.find((seat) => samePick(seat, picked)) ??
      (order[0] ? tree.entries.find((seat) => samePick(seat, order[0])) : undefined);
    if (entry) openAt(entry);
  };

  useCommands('app', { openSelected: openPicked });

  useCommands('files', {
    selectNext: () => moveTo(stepped(at, 1, order.length)),
    selectPrevious: () => moveTo(stepped(at, -1, order.length)),
    selectFirst: () => moveTo(0),
    selectLast: () => moveTo(order.length - 1),
    openSelected: openPicked,
    stageCurrent: () => {
      if (picked && !picked.staged) stageAt(picked.path);
    },
    unstageCurrent: () => {
      if (picked?.staged) unstageAt(picked.path);
    },
  });

  if (tree.merging && tree.conflicts > 0) return <MergingPanel {...props} />;

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

  const generateHint =
    ai.readiness === 'needsStaged'
      ? t('workingTree.generateNeedsStaged')
      : ai.readiness === 'needsSetup'
        ? t('workingTree.generateNeedsSetup')
        : t('workingTree.generate');

  return (
    <div data-area="files" className="flex min-h-0 flex-1 flex-col">
      <PanelHead
        count={tree.entries.length}
        branch={tree.branch}
        busy={busy}
        view={view}
        descending={descending}
        allClosed={folds.allClosed}
        onDiscardAll={() => onConfirm({ kind: 'operation', operation: { kind: 'discardAll' } })}
        onView={setView}
        onOrder={setDescending}
        onFoldAll={folds.foldAll}
      />

      <Section
        id="unstaged"
        title={t('workingTree.unstaged')}
        count={unstaged.length}
        action={t('workingTree.stageAll')}
        actionTone="added"
        entries={unstaged}
        rowAction={{ label: t('workingTree.stage'), icon: 'down' }}
        view={view}
        descending={descending}
        selectedPath={picked && !picked.staged ? picked.path : null}
        folds={folds}
        onMenu={openFileMenu}
        onAll={() => onRun({ kind: 'stageAll' })}
        onRow={stageAt}
        onOpen={openAt}
      />

      <Section
        id="staged"
        last
        title={t('workingTree.staged')}
        count={staged.length}
        action={t('workingTree.unstageAll')}
        actionTone="deleted"
        entries={staged}
        rowAction={{ label: t('workingTree.unstage'), icon: 'up' }}
        view={view}
        descending={descending}
        selectedPath={picked?.staged ? picked.path : null}
        folds={folds}
        onMenu={openFileMenu}
        onAll={() => onRun({ kind: 'unstageAll' })}
        onRow={unstageAt}
        onOpen={openAt}
      />

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
