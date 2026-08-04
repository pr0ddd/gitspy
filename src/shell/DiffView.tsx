import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import * as ipc from '../ipc';
import { languageOf, monaco, setUpMonaco, THEME } from '../monaco';
import { notifyError } from '../toast';
import { Icon } from '../icons';
import { PanelBar, ViewBar } from './parts';
import { shortenDirectory, splitPath } from '../paths';
import { cn } from '@/lib/utils';
import { DIFF_MODES, editorOptionsFor, type DiffMode } from '../diff';
import { isGitlinkDiff, parseUnifiedDiff, patchFor, type Hunk } from '../hunks';
import type { ChangedFileView, PathOperation, WorkingTreeView } from '../types';
import { Hint } from '@/components/ui/tooltip';
import { createRoot, type Root } from 'react-dom/client';

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

type Props = {
  repo: string;
  target: DiffTarget;
  onClose: () => void;
  onTree: (tree: WorkingTreeView) => void;
  onRun: (operation: PathOperation) => void;
  onTarget: (target: DiffTarget) => void;
  onHistory: (path: string) => void;
};

const MODE_HINT: Record<DiffMode, 'diff.hunkView' | 'diff.splitView' | 'diff.inlineView'> = {
  hunk: 'diff.hunkView',
  split: 'diff.splitView',
  inline: 'diff.inlineView',
};

const MODE_ICON: Record<DiffMode, keyof typeof Icon> = {
  hunk: 'diffHunk',
  split: 'diffSplit',
  inline: 'diffInline',
};

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
    <div className="bg-surface-raised border-border/50 flex h-full items-center gap-2 border-y px-2">
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

export function DiffView({ repo, target, onClose, onTree, onRun, onTarget, onHistory }: Props) {
  const path = target.kind === 'commit' ? target.file.path : target.path;
  const status = target.kind === 'commit' ? target.file.status : target.status;
  const binary = target.kind === 'commit' ? target.file.binary : false;
  const { t } = useTranslation();
  const host = useRef<HTMLDivElement | null>(null);
  const editor = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const [mode, setMode] = useState<DiffMode>('split');
  const [whitespace, setWhitespace] = useState(false);
  const [wrap, setWrap] = useState(false);
  const [sides, setSides] = useState<{ before: string; after: string } | null>(null);
  const [hunksRaw, setHunksRaw] = useState<string | null>(null);
  const [applied, setApplied] = useState(0);
  const [view, setView] = useState<'diff' | 'file'>('diff');
  const [editing, setEditing] = useState(false);
  const plain = useRef<HTMLDivElement | null>(null);
  const file = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  useEffect(() => {
    setUpMonaco();
    const element = host.current;
    if (!element) return;

    const created = monaco.editor.createDiffEditor(element, {
      theme: THEME,
      readOnly: true,
      automaticLayout: true,
      fontFamily: "'JetBrains Mono Variable', ui-monospace, Menlo, monospace",
      fontSize: 13,
      lineHeight: 20,
      minimap: { enabled: true },
      lightbulb: { enabled: monaco.editor.ShowLightbulbIconMode.Off },
      scrollBeyondLastLine: false,
      renderOverviewRuler: false,
    });
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

  useEffect(() => {
    if (view !== 'file' || !plain.current || !sides) return;

    const created = monaco.editor.create(plain.current, {
      theme: THEME,
      readOnly: !editing,
      automaticLayout: true,
      fontFamily: "'JetBrains Mono Variable', ui-monospace, Menlo, monospace",
      fontSize: 13,
      lineHeight: 20,
      minimap: { enabled: true },
      lightbulb: { enabled: monaco.editor.ShowLightbulbIconMode.Off },
      scrollBeyondLastLine: false,
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

  useEffect(() => {
    let cancelled = false;

    const reading =
      target.kind === 'commit'
        ? ipc.diffSides(repo, target.commit, target.file.path, target.file.oldPath ?? null)
        : ipc.workingTreeDiff(repo, target.path, target.staged);

    reading
      .then((sides) => {
        if (cancelled || !editor.current) return;
        setSides(sides);
        const language = languageOf(path);
        const previous = editor.current.getModel();
        editor.current.setModel({
          original: monaco.editor.createModel(sides.before, language),
          modified: monaco.editor.createModel(sides.after, language),
        });
        previous?.original.dispose();
        previous?.modified.dispose();
      })
      .catch(notifyError);

    if (target.kind === 'workingTree') {
      ipc
        .workingTreeHunks(repo, target.path, target.staged)
        .then((raw) => {
          if (!cancelled) setHunksRaw(raw);
        })
        .catch(() => setHunksRaw(null));
    } else {
      setHunksRaw(null);
    }

    return () => {
      cancelled = true;
    };
  }, [repo, target, path, applied]);

  useEffect(() => {
    const diffEditor = editor.current;
    if (!diffEditor || view !== 'diff' || mode !== 'hunk' || target.kind !== 'workingTree') return;
    if (!hunksRaw || isGitlinkDiff(hunksRaw)) return;
    const parsed = parseUnifiedDiff(hunksRaw);
    if (!parsed) return;

    const apply = (hunk: Hunk, cached: boolean, reverse: boolean) =>
      ipc
        .applyHunk(repo, patchFor(parsed, hunk), cached, reverse)
        .then((tree) => {
          onTree(tree);
          setApplied((n) => n + 1);
        })
        .catch(notifyError);

    const modified = diffEditor.getModifiedEditor();
    const zones: string[] = [];
    const roots: Root[] = [];
    modified.changeViewZones((accessor) => {
      for (const hunk of parsed.hunks) {
        const domNode = document.createElement('div');
        const root = createRoot(domNode);
        root.render(
          <HunkBar
            heading={hunk.heading}
            staged={target.staged}
            onApply={(cached, reverse) => apply(hunk, cached, reverse)}
          />,
        );
        roots.push(root);
        zones.push(
          accessor.addZone({
            afterLineNumber: hunk.newStart - 1,
            heightInPx: 26,
            domNode,
          }),
        );
      }
    });

    return () => {
      modified.changeViewZones((accessor) => zones.forEach((zone) => accessor.removeZone(zone)));
      queueMicrotask(() => roots.forEach((root) => root.unmount()));
    };
  }, [hunksRaw, view, mode, repo, target, onTree]);

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
    <div className="bg-surface flex min-h-0 min-w-0 flex-1 flex-col">
      <ViewBar>
        <span className={cn('shrink-0 text-xs', STATUS_STYLE[status])}>{status}</span>
        <span className="flex min-w-0 items-baseline text-xs">
          <span className="text-muted-foreground shrink-0">
            {shortenDirectory(splitPath(path).directory, 46)}
          </span>
          <span className="text-foreground truncate font-medium">{splitPath(path).name}</span>
        </span>

        <span className="text-muted-foreground text-2xs ml-auto shrink-0">UTF-8</span>

        {target.kind === 'workingTree' ? (
          <Button
            size="xs"
            className="shrink-0"
            onClick={() => {
              onRun({
                kind: target.staged ? 'unstage' : 'stage',
                paths: [target.path],
              });
              onTarget({ ...target, staged: !target.staged });
            }}
          >
            {t(target.staged ? 'diff.unstageFile' : 'diff.stageFile')}
          </Button>
        ) : null}

        <Hint text={t('diff.close')}>
          <Button variant="ghost" size="icon" className="size-6 shrink-0" onClick={onClose}>
            <Icon.close className="size-3.5" />
          </Button>
        </Hint>
      </ViewBar>

      <PanelBar>
        <div className="flex flex-1 items-center gap-1">
          {target.kind === 'workingTree' ? (
            <>
              <Hint text={t('diff.editHint')}>
                <Button
                  variant={editing ? 'secondary' : 'outline'}
                  size="2xs"
                  onClick={() => {
                    if (editing) {
                      setEditing(false);
                    } else {
                      setView('file');
                      setEditing(true);
                    }
                  }}
                >
                  <Icon.edit className="size-3" />
                  {t('diff.edit')}
                </Button>
              </Hint>
              {editing ? (
                <Button size="2xs" onClick={saveEdited}>
                  {t('diff.save')}
                </Button>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {target.kind === 'workingTree' ? (
            <Badge variant="secondary" className="rounded-sm px-1.5 py-0 text-2xs">
              {t(target.staged ? 'diff.staged' : 'diff.unstaged')}
            </Badge>
          ) : null}
          <div className="border-input flex h-6 shrink-0 items-center overflow-hidden rounded-md border">
            <Button
              variant={view === 'file' ? 'default' : 'ghost'}
              size="sm"
              className="h-full rounded-none px-2 text-xs"
              onClick={() => setView('file')}
            >
              {t('diff.fileView')}
            </Button>
            <Button
              variant={view === 'diff' ? 'default' : 'ghost'}
              size="sm"
              className="h-full rounded-none px-2 text-xs"
              onClick={() => setView('diff')}
            >
              {t('diff.diffView')}
            </Button>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-end gap-0.5">
          <Button variant="ghost" size="xs" className="shrink-0" onClick={() => onHistory(path)}>
            {t('diff.history')}
          </Button>
          <Hint text={t('diff.previous')}>
            <Button variant="ghost" size="icon" className="size-6" onClick={() => step('previous')}>
              <Icon.up className="size-3.5" />
            </Button>
          </Hint>
          <Hint text={t('diff.next')}>
            <Button variant="ghost" size="icon" className="size-6" onClick={() => step('next')}>
              <Icon.down className="size-3.5" />
            </Button>
          </Hint>
          {DIFF_MODES.map((shown) => {
            const ModeIcon = Icon[MODE_ICON[shown]];
            return (
              <Hint key={shown} text={t(MODE_HINT[shown])}>
                <Button
                  variant={view === 'diff' && mode === shown ? 'secondary' : 'ghost'}
                  size="icon"
                  className="size-6"
                  onClick={() => {
                    setView('diff');
                    setMode(shown);
                  }}
                >
                  <ModeIcon className="size-3.5" />
                </Button>
              </Hint>
            );
          })}
          <Hint text={t('diff.whitespace')}>
            <Button
              variant={whitespace ? 'secondary' : 'ghost'}
              size="icon"
              className="size-6"
              onClick={() => setWhitespace((now) => !now)}
            >
              <Icon.whitespace className="size-3.5" />
            </Button>
          </Hint>
          <Hint text={t('diff.wrap')}>
            <Button
              variant={wrap ? 'secondary' : 'ghost'}
              size="icon"
              className="size-6"
              onClick={() => setWrap((now) => !now)}
            >
              <Icon.wrap className="size-3.5" />
            </Button>
          </Hint>
        </div>
      </PanelBar>

      {binary ? (
        <p className="text-muted-foreground p-6 text-center">{t('diff.binary')}</p>
      ) : (
        <>
          <div ref={host} className={cn('min-h-0 flex-1', view === 'file' && 'hidden')} />
          <div ref={plain} className={cn('min-h-0 flex-1', view === 'diff' && 'hidden')} />
        </>
      )}
    </div>
  );
}
