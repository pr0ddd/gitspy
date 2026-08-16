import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';
import * as ipc from '@/shared/api/ipc';
import {
  DIFF_EDITOR_BASE,
  EDITOR_BASE,
  languageOf,
  monaco,
  setHiddenLineSpans,
  setModelWithZonesInOnePass,
  setUpMonaco,
  userEditorOptions,
  waitForDiffOrGiveUp,
} from '@/entities/diff';
import { notifyError } from '@/shared/ui/toast';
import { Icon } from '@/shared/ui/icons';
import { DiffToolbar } from './DiffToolbar';
import { ViewBar } from '@/shared/ui/parts';
import { shortenDirectory, splitPath } from '@/shared/lib/paths';
import { cn } from '@/shared/lib/utils';
import { editorOptionsFor, sameDiffTarget, type DiffMode, type DiffTarget } from '@/entities/diff';
import { usePref } from '@/shared/lib/prefs';
import {
  hiddenSpans,
  isGitlinkDiff,
  parseUnifiedDiff,
  patchFor,
  type Hunk,
  type UnifiedDiff,
} from '@/entities/diff';
import type { PathOperation, WorkingTreeView } from '@/shared/api/types';
import { Hint } from '@/shared/ui/tooltip';

const STATUS_STYLE: Record<string, string> = {
  A: 'text-added',
  M: 'text-modified',
  D: 'text-deleted',
  R: 'text-renamed',
  C: 'text-renamed',
  T: 'text-modified',
  U: 'text-conflict',
};

const HUNK_BAR_HEIGHT = 44;
const DIFF_WAIT_LIMIT_MS = 1000;

const lineTally = (text: string): number => text.split('\n').length;

type Loaded = {
  for: DiffTarget;
  before: string;
  after: string;
  compared: monaco.editor.IDiffEditorViewModel;
  raw: string | null;
};

const disposeCompared = (compared: monaco.editor.IDiffEditorViewModel) => {
  const { original, modified } = compared.model;
  compared.dispose();
  original.dispose();
  modified.dispose();
};

const hunkBarNode = (): HTMLDivElement => {
  const node = document.createElement('div');
  node.style.pointerEvents = 'auto';
  node.style.zIndex = '10';
  return node;
};

const hunkMarginNode = (): HTMLDivElement => {
  const node = document.createElement('div');
  node.className = 'border-border h-full w-full border-b';
  return node;
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
    <div className="flex h-full items-end gap-2 border-b pb-1.5 pl-3 pr-1">
      <span className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-2xs">
        {heading}
      </span>
      <Button variant="outline" size="2xs" title={t('diff.revertHunkHint')} onClick={onRevert}>
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
    <div className="flex h-full items-end gap-2 border-b pb-1.5 pl-3 pr-1">
      <span className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-2xs">
        {heading}
      </span>
      {staged ? (
        <Button variant="outlineDeleted" size="2xs" onClick={() => onApply(true, true)}>
          {t('diff.unstageHunk')}
        </Button>
      ) : (
        <>
          <Button variant="outlineDeleted" size="2xs" onClick={() => onApply(false, true)}>
            {t('diff.discardHunk')}
          </Button>
          <Button variant="outlineAdded" size="2xs" onClick={() => onApply(true, false)}>
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
  const shown = useRef<Loaded | null>(null);
  const [mode, setMode] = usePref<DiffMode>('diff.mode', 'split');
  const [whitespace, setWhitespace] = usePref('diff.whitespace', false);
  const [wrap, setWrap] = usePref('diff.wrap', false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [applied, setApplied] = useState(0);
  const [view, setView] = useState<'diff' | 'file'>('diff');
  const [editing, setEditing] = useState(false);
  const plain = useRef<HTMLDivElement | null>(null);
  const file = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  useLayoutEffect(() => {
    setUpMonaco();
    const element = host.current;
    if (!element) return;

    const created = monaco.editor.createDiffEditor(element, {
      ...DIFF_EDITOR_BASE,
      ...userEditorOptions(),
    });
    editor.current = created;

    return () => {
      created.dispose();
      editor.current = null;
      if (shown.current) {
        disposeCompared(shown.current.compared);
        shown.current = null;
      }
    };
  }, []);

  useLayoutEffect(() => {
    editor.current?.updateOptions({
      ...editorOptionsFor(mode),
      ignoreTrimWhitespace: whitespace,
      diffWordWrap: wrap ? 'on' : 'off',
    });
    const side = { wordWrap: (wrap ? 'on' : 'off') as 'on' | 'off', lineNumbersMinChars: 5 };
    editor.current?.getModifiedEditor().updateOptions(side);
    editor.current?.getOriginalEditor().updateOptions(side);
  }, [mode, whitespace, wrap]);

  useLayoutEffect(() => {
    if (view !== 'file' || !plain.current || !loaded) return;

    const created = monaco.editor.create(plain.current, {
      ...EDITOR_BASE,
      ...userEditorOptions(),
      readOnly: !editing,
      wordWrap: wrap ? 'on' : 'off',
      value: loaded.after,
      language: languageOf(path),
    });
    file.current = created;
    if (editing) {
      created.getDomNode()?.setAttribute('data-editing', 'true');
      created.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveLatest.current());
    }

    return () => {
      created.getModel()?.dispose();
      created.dispose();
      file.current = null;
    };
  }, [view, loaded, path, wrap, editing]);

  const step = (where: 'previous' | 'next') => {
    editor.current?.goToDiff(where);
  };

  useEffect(() => {
    let cancelled = false;
    let inflight: monaco.editor.IDiffEditorViewModel | null = null;
    const language = languageOf(path);

    const readingSides =
      target.kind === 'commit'
        ? ipc.diffSides(repo, target.commit, target.file.path, target.file.oldPath ?? null)
        : ipc.workingTreeDiff(repo, target.path, target.staged);
    const readingHunks =
      target.kind === 'commit'
        ? ipc.commitFileHunks(repo, target.commit, target.file.path)
        : ipc.workingTreeHunks(repo, target.path, target.staged);

    const comparing = readingSides.then((sides) => {
      const diffEditor = editor.current;
      if (cancelled || !diffEditor) return null;
      const compared = diffEditor.createViewModel({
        original: monaco.editor.createModel(sides.before, language),
        modified: monaco.editor.createModel(sides.after, language),
      });
      inflight = compared;
      return waitForDiffOrGiveUp(compared, DIFF_WAIT_LIMIT_MS).then(() => ({ sides, compared }));
    });

    Promise.all([comparing, readingHunks.catch(() => null)])
      .then(([ready, raw]) => {
        if (!ready || cancelled) return;
        inflight = null;
        setLoaded({
          for: target,
          before: ready.sides.before,
          after: ready.sides.after,
          compared: ready.compared,
          raw,
        });
      })
      .catch(notifyError);

    return () => {
      cancelled = true;
      if (inflight) {
        disposeCompared(inflight);
        inflight = null;
      }
    };
  }, [repo, target, path, applied]);

  const hunkView = useMemo(() => {
    if (!loaded?.raw || isGitlinkDiff(loaded.raw)) return null;
    const diff = parseUnifiedDiff(loaded.raw);
    if (!diff) return null;
    return {
      for: loaded.for,
      diff,
      bars: diff.hunks.map(hunkBarNode),
      margins: diff.hunks.map(hunkMarginNode),
    };
  }, [loaded]);

  useLayoutEffect(() => {
    const diffEditor = editor.current;
    if (!diffEditor || !loaded) return;
    const original = diffEditor.getOriginalEditor();
    const modified = diffEditor.getModifiedEditor();
    const previous = shown.current;
    const keptScroll =
      previous && sameDiffTarget(previous.for, loaded.for) ? modified.getScrollTop() : null;
    const hunks = mode === 'hunk' && hunkView && hunkView.for === loaded.for ? hunkView : null;
    const spans = hunks
      ? hiddenSpans(hunks.diff.hunks, lineTally(loaded.before), lineTally(loaded.after))
      : { original: [], modified: [] };
    const zones = hunks
      ? hunks.diff.hunks.map((hunk, index) => ({
          afterLineNumber: hunk.newStart - 1,
          heightInPx: HUNK_BAR_HEIGHT,
          domNode: hunks.bars[index],
          marginDomNode: hunks.margins[index],
        }))
      : [];

    setModelWithZonesInOnePass(diffEditor, loaded.compared, zones);
    setHiddenLineSpans(original, spans.original);
    setHiddenLineSpans(modified, spans.modified);

    if (keptScroll !== null) {
      modified.setScrollTop(keptScroll);
    } else if (mode === 'hunk') {
      modified.setScrollTop(0);
    } else if (hunkView && hunkView.for === loaded.for) {
      modified.revealLineNearTop(
        hunkView.diff.hunks[0].newStart,
        monaco.editor.ScrollType.Immediate,
      );
    } else {
      diffEditor.revealFirstDiff();
    }

    shown.current = loaded;
    if (previous && previous !== loaded) disposeCompared(previous.compared);
    if (!hunks) return;

    const pin = () => {
      const layout = modified.getLayoutInfo();
      const width = layout.contentWidth - layout.verticalScrollbarWidth;
      const left = modified.getScrollLeft();
      for (const node of hunks.bars) {
        node.style.width = `${Math.max(0, width)}px`;
        node.style.transform = `translateX(${left}px)`;
      }
    };
    pin();
    const onScroll = modified.onDidScrollChange(pin);
    const onLayout = modified.onDidLayoutChange(pin);
    return () => {
      onScroll.dispose();
      onLayout.dispose();
    };
  }, [loaded, hunkView, mode]);

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

  const saveLatest = useRef(() => {});
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
  saveLatest.current = saveEdited;

  return (
    <div data-area="files" className="flex min-h-0 min-w-0 flex-1 flex-col">
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
