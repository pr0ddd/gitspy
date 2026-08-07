import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import * as ipc from '@/ipc';
import {
  DIFF_EDITOR_BASE,
  EDITOR_BASE,
  languageOf,
  monaco,
  setHiddenLineSpans,
  setUpMonaco,
  userEditorOptions,
} from '@/entities/diff';
import { notifyError } from '@/toast';
import { Icon } from '@/icons';
import { DiffToolbar } from './DiffToolbar';
import { ViewBar } from '@/parts';
import { shortenDirectory, splitPath } from '@/paths';
import { cn } from '@/lib/utils';
import { editorOptionsFor, type DiffMode } from '@/entities/diff';
import { usePref } from '@/prefs';
import {
  hiddenSpans,
  isGitlinkDiff,
  parseUnifiedDiff,
  patchFor,
  type Hunk,
  type UnifiedDiff,
} from '@/entities/diff';
import type { ChangedFileView, PathOperation, WorkingTreeView } from '@/types';
import { Hint } from '@/components/ui/tooltip';

const STATUS_STYLE: Record<string, string> = {
  A: 'text-added',
  M: 'text-modified',
  D: 'text-deleted',
  R: 'text-renamed',
  C: 'text-renamed',
  T: 'text-modified',
  U: 'text-conflict',
};

export type DiffTarget =
  | { kind: 'commit'; commit: string; file: ChangedFileView }
  | { kind: 'workingTree'; path: string; status: string; staged: boolean };

const lineTally = (text: string): number => text.split('\n').length;

export const sameDiffTarget = (left: DiffTarget, right: DiffTarget): boolean => {
  if (left.kind === 'commit' && right.kind === 'commit') {
    return left.commit === right.commit && left.file.path === right.file.path;
  }
  if (left.kind === 'workingTree' && right.kind === 'workingTree') {
    return left.path === right.path && left.staged === right.staged;
  }
  return false;
};

type Props = {
  repo: string;
  target: DiffTarget;
  onClose: () => void;
  onTree: (tree: WorkingTreeView) => void;
  onRun: (operation: PathOperation) => void;
  onTarget: (target: DiffTarget) => void;
  onHistory: (path: string, from?: string) => void;
};

function CommitHunkBar({ heading, onRevert }: { heading: string; onRevert: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="bg-fill-1 flex h-full items-center gap-2 rounded-md px-2">
      <span className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-2xs">
        {heading}
      </span>
      <Button
        variant="outline"
        size="2xs"
        title={t('diff.revertHunkHint')}
        onClick={onRevert}
      >
        {t('diff.revertHunk')}
      </Button>
    </div>
  );
}

function HunkBar({
  heading,
  staged,
  onApply,
}: {
  heading: string;
  staged: boolean;
  onApply: (cached: boolean, reverse: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="bg-fill-1 flex h-full items-center gap-2 rounded-md px-2">
      <span className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-2xs">
        {heading}
      </span>
      {staged ? (
        <Button variant="outline" size="2xs" onClick={() => onApply(true, true)}>
          {t('diff.unstageHunk')}
        </Button>
      ) : (
        <>
          <Button
            variant="outline"
            size="2xs"
            className="text-deleted"
            onClick={() => onApply(false, true)}
          >
            {t('diff.discardHunk')}
          </Button>
          <Button
            variant="outline"
            size="2xs"
            className="text-added"
            onClick={() => onApply(true, false)}
          >
            {t('diff.stageHunk')}
          </Button>
        </>
      )}
    </div>
  );
}

export function DiffView({ repo, target, onClose, onTree, onHistory }: Props) {
  const path = target.kind === 'commit' ? target.file.path : target.path;
  const status = target.kind === 'commit' ? target.file.status : target.status;
  const binary = target.kind === 'commit' ? target.file.binary : false;
  const { t } = useTranslation();
  const host = useRef<HTMLDivElement | null>(null);
  const editor = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const [mode, setMode] = usePref<DiffMode>('diff.mode', 'split');
  const [whitespace, setWhitespace] = usePref('diff.whitespace', false);
  const [wrap, setWrap] = usePref('diff.wrap', false);
  const [sides, setSides] = useState<{ for: DiffTarget; before: string; after: string } | null>(
    null,
  );
  const [patch, setPatch] = useState<{ for: DiffTarget; raw: string | null } | null>(null);
  const [applied, setApplied] = useState(0);
  const [view, setView] = useState<'diff' | 'file'>('diff');
  const [editing, setEditing] = useState(false);
  const plain = useRef<HTMLDivElement | null>(null);
  const file = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  useEffect(() => {
    setUpMonaco();
    const element = host.current;
    if (!element) return;

    const created = monaco.editor.createDiffEditor(element, { ...DIFF_EDITOR_BASE, ...userEditorOptions() });
    editor.current = created;

    return () => {
      created.getModel()?.original.dispose();
      created.getModel()?.modified.dispose();
      created.dispose();
      editor.current = null;
    };
  }, []);

  useEffect(() => {
    editor.current?.updateOptions({
      ...editorOptionsFor(mode),
      ignoreTrimWhitespace: whitespace,
      diffWordWrap: wrap ? 'on' : 'off',
    });
    editor.current?.getModifiedEditor().updateOptions({ wordWrap: wrap ? 'on' : 'off' });
    editor.current?.getOriginalEditor().updateOptions({ wordWrap: wrap ? 'on' : 'off' });
  }, [mode, whitespace, wrap]);

  useLayoutEffect(() => {
    if (view !== 'file' || !plain.current || !sides) return;

    const created = monaco.editor.create(plain.current, {
      ...EDITOR_BASE,
            ...userEditorOptions(),
      readOnly: !editing,
      wordWrap: wrap ? 'on' : 'off',
      value: sides.after,
      language: languageOf(path),
    });
    file.current = created;
    if (editing) {
      created.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, saveEdited);
    }

    return () => {
      created.getModel()?.dispose();
      created.dispose();
      file.current = null;
    };
  }, [view, sides, path, wrap, editing]);

  const step = (where: 'previous' | 'next') => {
    editor.current?.goToDiff(where);
  };

  const jumpedRef = useRef<DiffTarget | null>(null);

  useEffect(() => {
    let cancelled = false;

    const readingSides =
      target.kind === 'commit'
        ? ipc.diffSides(repo, target.commit, target.file.path, target.file.oldPath ?? null)
        : ipc.workingTreeDiff(repo, target.path, target.staged);
    const readingHunks =
      target.kind === 'commit'
        ? ipc.commitFileHunks(repo, target.commit, target.file.path)
        : ipc.workingTreeHunks(repo, target.path, target.staged);

    Promise.all([readingSides, readingHunks.catch(() => null)])
      .then(([loaded, raw]) => {
        if (cancelled) return;
        setSides({ for: target, before: loaded.before, after: loaded.after });
        setPatch({ for: target, raw });
      })
      .catch(notifyError);

    return () => {
      cancelled = true;
    };
  }, [repo, target, path, applied]);

  const hunkView = useMemo(() => {
    if (!patch?.raw || isGitlinkDiff(patch.raw)) return null;
    const diff = parseUnifiedDiff(patch.raw);
    if (!diff) return null;
    return {
      for: patch.for,
      diff,
      bars: diff.hunks.map(() => document.createElement('div')),
    };
  }, [patch]);

  useLayoutEffect(() => {
    const diffEditor = editor.current;
    if (!diffEditor || !sides || sides.for !== target) return;
    const language = languageOf(path);
    const previous = diffEditor.getModel();
    const modified = diffEditor.getModifiedEditor();
    const keptScroll = jumpedRef.current === target ? modified.getScrollTop() : null;
    diffEditor.setModel({
      original: monaco.editor.createModel(sides.before, language),
      modified: monaco.editor.createModel(sides.after, language),
    });
    previous?.original.dispose();
    previous?.modified.dispose();
    if (keptScroll !== null) {
      modified.setScrollTop(keptScroll);
    }
  }, [sides, target, path]);

  useLayoutEffect(() => {
    const diffEditor = editor.current;
    if (!diffEditor || !sides || sides.for !== target) return;
    const patchReady = hunkView && hunkView.for === sides.for ? hunkView : null;
    const spans =
      mode === 'hunk' && patchReady
        ? hiddenSpans(patchReady.diff.hunks, lineTally(sides.before), lineTally(sides.after))
        : { original: [], modified: [] };
    setHiddenLineSpans(diffEditor.getOriginalEditor(), spans.original);
    setHiddenLineSpans(diffEditor.getModifiedEditor(), spans.modified);
    if (jumpedRef.current === target) return;
    jumpedRef.current = target;
    const modified = diffEditor.getModifiedEditor();
    if (mode === 'hunk') {
      modified.setScrollTop(0);
    } else if (patchReady) {
      modified.revealLineNearTop(
        patchReady.diff.hunks[0].newStart,
        monaco.editor.ScrollType.Immediate,
      );
    } else {
      diffEditor.revealFirstDiff();
    }
  }, [sides, hunkView, target, mode]);

  useLayoutEffect(() => {
    const diffEditor = editor.current;
    if (!diffEditor || view !== 'diff' || mode !== 'hunk' || !hunkView) return;

    const modified = diffEditor.getModifiedEditor();
    const zones: string[] = [];
    modified.changeViewZones((accessor) => {
      hunkView.diff.hunks.forEach((hunk, index) => {
        const domNode = hunkView.bars[index];
        domNode.style.pointerEvents = 'auto';
        domNode.style.zIndex = '10';
        zones.push(
          accessor.addZone({
            afterLineNumber: hunk.newStart - 1,
            heightInPx: 26,
            domNode,
          }),
        );
      });
    });

    const pin = () => {
      const width = modified.getLayoutInfo().contentWidth;
      const left = modified.getScrollLeft();
      for (const node of hunkView.bars) {
        node.style.width = `${Math.max(0, width - 12)}px`;
        node.style.transform = `translateX(${left}px)`;
      }
    };
    pin();
    const onScroll = modified.onDidScrollChange(pin);
    const onLayout = modified.onDidLayoutChange(pin);

    return () => {
      onScroll.dispose();
      onLayout.dispose();
      modified.changeViewZones((accessor) => zones.forEach((zone) => accessor.removeZone(zone)));
    };
  }, [hunkView, view, mode]);

  const applyHunk = (source: UnifiedDiff, hunk: Hunk, cached: boolean, reverse: boolean) =>
    ipc
      .applyHunk(repo, patchFor(source, hunk), cached, reverse)
      .then((tree) => {
        onTree(tree);
        setApplied((n) => n + 1);
      })
      .catch(notifyError);

  useEffect(() => {
    setEditing(false);
  }, [target]);

  const saveEdited = () => {
    const content = file.current?.getValue();
    if (content === undefined || target.kind !== 'workingTree') return;
    ipc
      .writeFile(repo, target.path, content)
      .then((tree) => {
        onTree(tree);
        setApplied((n) => n + 1);
      })
      .catch(notifyError);
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <ViewBar>
        <span className={cn('shrink-0 text-xs', STATUS_STYLE[status])}>{status}</span>
        <span className="flex min-w-0 items-baseline text-xs">
          <span className="text-muted-foreground shrink-0">
            {shortenDirectory(splitPath(path).directory, 46)}
          </span>
          <span className="text-foreground truncate font-medium">{splitPath(path).name}</span>
        </span>

        <span className="text-muted-foreground text-2xs ml-auto shrink-0">UTF-8</span>

        <Hint text={t('diff.close')}>
          <Button variant="ghost" size="icon" className="size-6 shrink-0" onClick={onClose}>
            <Icon.close className="size-3.5" />
          </Button>
        </Hint>
      </ViewBar>

      <DiffToolbar
        view={view}
        mode={mode}
        whitespace={whitespace}
        wrap={wrap}
        onView={setView}
        onMode={setMode}
        onWhitespace={setWhitespace}
        onWrap={setWrap}
        onStep={step}
        start={
          target.kind === 'workingTree' ? (
            <>
              <Hint text={t('diff.editHint')}>
                <Button
                  variant={editing ? 'secondary' : 'action'}
                  size="xs"
                  onClick={() => {
                    if (editing) {
                      setEditing(false);
                    } else {
                      setView('file');
                      setEditing(true);
                    }
                  }}
                >
                  <Icon.edit className="size-3.5" />
                  {t('diff.edit')}
                </Button>
              </Hint>
              {editing ? (
                <Button size="xs" onClick={saveEdited}>
                  {t('diff.save')}
                </Button>
              ) : null}
            </>
          ) : null
        }
        end={
          <Button
            variant="action"
            size="xs"
            className="shrink-0"
            onClick={() => onHistory(path, target.kind === 'commit' ? target.commit : undefined)}
          >
            {t('diff.history')}
          </Button>
        }
      />

      {binary ? (
        <p className="text-muted-foreground p-6 text-center">{t('diff.binary')}</p>
      ) : (
        <>
          <div ref={host} className={cn('min-h-0 flex-1', view === 'file' && 'hidden')} />
          <div ref={plain} className={cn('min-h-0 flex-1', view === 'diff' && 'hidden')} />
          {view === 'diff' && mode === 'hunk' && hunkView
            ? hunkView.diff.hunks.map((hunk, index) =>
                createPortal(
                  hunkView.for.kind === 'workingTree' ? (
                    <HunkBar
                      heading={hunk.heading}
                      staged={hunkView.for.staged}
                      onApply={(cached, reverse) => applyHunk(hunkView.diff, hunk, cached, reverse)}
                    />
                  ) : (
                    <CommitHunkBar
                      heading={hunk.heading}
                      onRevert={() => applyHunk(hunkView.diff, hunk, false, true)}
                    />
                  ),
                  hunkView.bars[index],
                  `${index}:${hunk.heading}`,
                ),
              )
            : null}
        </>
      )}
    </div>
  );
}
