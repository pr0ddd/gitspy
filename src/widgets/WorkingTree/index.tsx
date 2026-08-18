import { useTranslation } from 'react-i18next';
import { usePref } from '@/shared/lib/prefs';
import { useGenerateCommit, useRepoWork } from '@/features/repo';
import type { Confirmation, Picked } from '@/entities/repo';
import type { Operation, PathOperation, WorkingTreeView } from '@/shared/api/types';
import { CommitBox } from './CommitBox';
import { PanelHead } from './PanelHead';
import { Section } from './Section';
import type { FileView } from './order';
import { useFileMenu } from './useFileMenu';
import { useFileNavigation } from './useFileNavigation';
import { useFolds } from './useFolds';

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

  const openFileMenu = useFileMenu({
    repo,
    onRun,
    onOperation: props.onOperation,
    onCopy,
    onHistory,
    onConfirm,
  });
  const [view, setView] = usePref<FileView>('workingTree.view', 'path');
  const [descending, setDescending] = usePref('workingTree.sortDescending', false);
  const folds = useFolds(tree.entries);
  const [pushAfter, setPushAfter] = usePref<boolean>('commit.push', false);

  const staged = tree.entries.filter((e) => e.staged);
  const unstaged = tree.entries.filter((e) => !e.staged);
  const resolving = tree.merging !== null && tree.conflicts > 0;
  const conflicted = resolving ? unstaged.filter((e) => e.letter === 'U') : [];
  const pending = resolving ? unstaged.filter((e) => e.letter !== 'U') : unstaged;
  const committable = tree.merging
    ? message.trim().length > 0 && conflicted.length === 0
    : message.trim().length > 0 && (staged.length > 0 || amend);

  const ai = useGenerateCommit({
    repo,
    hasStaged: staged.length > 0,
    onDraft: (summary, body) => {
      onMessage(summary);
      onDescription(body);
    },
  });

  const { stageAt, unstageAt, openAt } = useFileNavigation({
    tree,
    unstaged,
    staged,
    view,
    descending,
    resolving,
    picked,
    diffOpen,
    onPick,
    onOpen,
    onRun,
  });

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
        merging={tree.merging?.from ?? null}
        busy={busy}
        view={view}
        descending={descending}
        allClosed={folds.allClosed}
        onDiscardAll={() => onConfirm({ kind: 'operation', operation: { kind: 'discardAll' } })}
        onView={setView}
        onOrder={setDescending}
        onFoldAll={folds.foldAll}
      />

      {resolving ? (
        <Section
          id="conflicted"
          title={t('workingTree.conflicted')}
          count={conflicted.length}
          action={t('workingTree.markAllResolved')}
          actionTone="added"
          entries={conflicted}
          rowAction={{ label: t('conflict.markResolved'), icon: 'down' }}
          view={view}
          descending={descending}
          selectedPath={picked && !picked.staged ? picked.path : null}
          folds={folds}
          onMenu={openFileMenu}
          onAll={() => onRun({ kind: 'stage', paths: conflicted.map((e) => e.path) })}
          onRow={stageAt}
          onOpen={openAt}
        />
      ) : null}

      {resolving && pending.length === 0 ? null : (
        <Section
          id="unstaged"
          title={t('workingTree.unstaged')}
          count={pending.length}
          action={t('workingTree.stageAll')}
          actionTone="added"
          entries={pending}
          rowAction={{ label: t('workingTree.stage'), icon: 'down' }}
          view={view}
          descending={descending}
          selectedPath={picked && !picked.staged ? picked.path : null}
          folds={folds}
          onMenu={openFileMenu}
          onAll={() =>
            resolving
              ? onRun({ kind: 'stage', paths: pending.map((e) => e.path) })
              : onRun({ kind: 'stageAll' })
          }
          onRow={stageAt}
          onOpen={openAt}
        />
      )}

      <Section
        id={resolving ? 'resolved' : 'staged'}
        last
        title={t(resolving ? 'workingTree.resolved' : 'workingTree.staged')}
        count={staged.length}
        action={t(resolving ? 'conflict.unresolveAll' : 'workingTree.unstageAll')}
        actionTone="deleted"
        entries={staged}
        rowAction={{
          label: t(resolving ? 'conflict.unresolve' : 'workingTree.unstage'),
          icon: 'up',
        }}
        view={view}
        descending={descending}
        selectedPath={picked?.staged ? picked.path : null}
        folds={folds}
        onMenu={openFileMenu}
        onAll={() =>
          resolving
            ? onRun({ kind: 'unresolve', paths: staged.map((e) => e.path) })
            : onRun({ kind: 'unstageAll' })
        }
        onRow={unstageAt}
        onOpen={openAt}
      />

      <CommitBox
        message={message}
        description={description}
        onMessage={onMessage}
        onDescription={onDescription}
        onHotkey={commitOnHotkey}
        generateHint={generateHint}
        generateReady={ai.readiness === 'ready'}
        generating={ai.generating}
        onGenerate={ai.generate}
        amend={{
          checked: amend,
          disabled: !previous || tree.merging !== null,
          hint: tree.merging ? t('workingTree.amendDuringMerge') : null,
          onToggle: toggleAmend,
        }}
        pushAfter={pushAfter}
        onPushAfter={setPushAfter}
        merging={tree.merging !== null}
        committable={committable}
        busy={busy}
        committing={committing}
        onCommit={onCommit}
        onAbort={() => props.onOperation({ kind: 'mergeAbort' })}
      />
    </div>
  );
}
