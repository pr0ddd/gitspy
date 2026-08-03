import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import * as ipc from '../ipc';
import { languageOf, monaco, setUpMonaco, THEME } from '../monaco';
import { notifyError } from '../toast';
import { Icon } from '../icons';
import { shortenDirectory, splitPath } from '../paths';
import { cn } from '@/lib/utils';
import { DIFF_MODES, DIFF_MODE_LABEL, editorOptionsFor, type DiffMode } from '../diff';
import type { ChangedFileView } from '../types';
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

type Props = {
  repo: string;
  target: DiffTarget;
  onClose: () => void;
};

const worktreePath = (repo: string, path: string) => `${repo}/${path}`;

export function DiffView({ repo, target, onClose }: Props) {
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
  const [view, setView] = useState<'diff' | 'file'>('diff');
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
      fontSize: 12,
      lineHeight: 18,
      minimap: { enabled: false },
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
      readOnly: true,
      automaticLayout: true,
      fontSize: 12,
      lineHeight: 18,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      wordWrap: wrap ? 'on' : 'off',
      value: sides.after,
      language: languageOf(path),
    });
    file.current = created;

    return () => {
      created.getModel()?.dispose();
      created.dispose();
      file.current = null;
    };
  }, [view, sides, path, wrap]);

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

    return () => {
      cancelled = true;
    };
  }, [repo, target, path]);

  return (
    <div className="bg-surface flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="bg-card border-border flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <span className={cn('shrink-0 font-mono text-xs', STATUS_STYLE[status])}>{status}</span>
        <span className="flex min-w-0 items-baseline font-mono text-xs">
          <span className="text-muted-foreground shrink-0">
            {shortenDirectory(splitPath(path).directory, 46)}
          </span>
          <span className="text-foreground truncate font-medium">{splitPath(path).name}</span>
        </span>

        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <Hint text={t('diff.editHint')}>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1.5 px-2 text-xs"
              onClick={() => ipc.openInEditor(worktreePath(repo, path)).catch(notifyError)}
            >
              <Icon.edit className="size-3.5" />
              {t('diff.edit')}
            </Button>
          </Hint>
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

        <span className="text-muted-foreground/60 shrink-0 font-mono text-2xs">UTF-8</span>

        <div className="border-input flex h-6 shrink-0 items-center overflow-hidden rounded-md border">
          <Button
            variant={view === 'file' ? 'default' : 'ghost'}
            size="sm"
            className="h-full rounded-none px-2 text-xs"
            onClick={() => setView('file')}
          >
            {t('diff.fileView')}
          </Button>
          {DIFF_MODES.map((shown) => (
            <Button
              key={shown}
              variant={view === 'diff' && mode === shown ? 'default' : 'ghost'}
              size="sm"
              className="h-full rounded-none px-2 text-xs"
              onClick={() => {
                setView('diff');
                setMode(shown);
              }}
            >
              {DIFF_MODE_LABEL[shown]}
            </Button>
          ))}
        </div>

        <Hint text={t('diff.close')}>
          <Button variant="ghost" size="icon" className="size-6 shrink-0" onClick={onClose}>
            <Icon.close className="size-3.5" />
          </Button>
        </Hint>
      </header>

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
