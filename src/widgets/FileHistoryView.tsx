import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Hint } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
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
import { laneColour } from '@/theme';
import {
  editorOptionsFor,
  hiddenSpans,
  isGitlinkDiff,
  parseUnifiedDiff,
  type DiffMode,
  type HiddenSpan,
} from '@/entities/diff';
import { usePref } from '@/prefs';
import { DiffToolbar } from './DiffToolbar';
import { InlineNote, ListRow, ViewBar } from '@/parts';
import { shortenDirectory, splitPath } from '@/paths';
import { relativeTime } from '@/time';
import type { AvatarCache } from '@/avatarCache';
import type { BlameSpanView, FileCommitView } from '@/types';

type Props = {
  repo: string;
  path: string;
  from: string | null;
  avatars: AvatarCache | null;
  onClose: () => void;
};

function CommitAvatar({ avatars, email }: { avatars: AvatarCache | null; email: string }) {
  const look = avatars?.lookOf(email);
  if (look?.kind === 'image' && look.image instanceof HTMLImageElement) {
    return <img src={look.image.src} alt="" className="size-6 shrink-0 rounded-sm" />;
  }
  return <span className="bg-fill-2 size-6 shrink-0 rounded-md" />;
}

const LINE_H = EDITOR_BASE.lineHeight;

const hideOutsideHunks = (
  editor: monaco.editor.IStandaloneDiffEditor,
  spans: { original: HiddenSpan[]; modified: HiddenSpan[] } | null,
): void => {
  setHiddenLineSpans(editor.getOriginalEditor(), spans?.original ?? []);
  setHiddenLineSpans(editor.getModifiedEditor(), spans?.modified ?? []);
};

const spanTint = (hash: string): string => laneColour(parseInt(hash.slice(0, 2), 16) % 12);

function BlameGutter({
  spans,
  scrollTop,
  onPick,
}: {
  spans: BlameSpanView[];
  scrollTop: number;
  onPick: (hash: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const short = new Intl.DateTimeFormat(i18n.language, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const long = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'long',
    timeStyle: 'short',
  });
  return (
    <div className="border-border relative w-72 shrink-0 overflow-hidden border-r">
      <div style={{ transform: `translateY(${-scrollTop}px)` }}>
        {spans.map((span) => (
          <Hint
            key={`${span.hash}:${span.startLine}`}
            text={
              <span className="block max-w-72">
                <span className="text-muted-foreground block">
                  {t('history.authored', {
                    author: span.author,
                    when: long.format(new Date(span.time * 1000)),
                  })}
                </span>
                <span className="block">{span.summary}</span>
              </span>
            }
          >
            <button
              onClick={() => onPick(span.hash)}
              className="group absolute right-0 left-0 overflow-hidden text-left"
              style={{
                top: (span.startLine - 1) * LINE_H,
                height: span.lines * LINE_H,
              }}
            >
              <span className="bg-muted-foreground/25 group-hover:bg-muted-foreground/40 absolute inset-y-0.5 left-1 w-1.5 rounded-sm" />
              <span className="flex h-5 items-center gap-1.5 pr-1.5 pl-4">
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{span.summary}</span>
                <span className="text-muted-foreground shrink-0 font-mono text-2xs">
                  {short.format(new Date(span.time * 1000))}
                </span>
              </span>
              <span
                className="absolute inset-y-0 right-0 w-0.5"
                style={{ background: spanTint(span.hash) }}
              />
            </button>
          </Hint>
        ))}
      </div>
    </div>
  );
}

export function FileHistoryView({ repo, path, from, avatars, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const [history, setHistory] = useState<FileCommitView[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [view, setView] = useState<'file' | 'diff'>('file');
  const [mode, setMode] = usePref<DiffMode>('diff.mode', 'split');
  const [whitespace, setWhitespace] = usePref('diff.whitespace', false);
  const [wrap, setWrap] = usePref('diff.wrap', false);
  const [blame, setBlame] = useState<BlameSpanView[] | null>(null);
  const [blaming, setBlaming] = useState(true);
  const [scrollTop, setScrollTop] = useState(0);

  const fileHost = useRef<HTMLDivElement | null>(null);
  const diffHost = useRef<HTMLDivElement | null>(null);
  const editors = useRef<monaco.IDisposable[]>([]);
  const diffEditor = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const hunkSpans = useRef<{ original: HiddenSpan[]; modified: HiddenSpan[] } | null>(null);
  const diffLook = useRef({ mode, whitespace, wrap });
  diffLook.current = { mode, whitespace, wrap };

  const commits = history ?? [];
  const entry = commits.find((c) => c.hash === chosen) ?? commits[0] ?? null;

  useEffect(() => {
    let cancelled = false;
    ipc
      .fileHistory(repo, path, from)
      .then((found) => {
        if (cancelled) return;
        setHistory(found);
        setChosen(found[0]?.hash ?? null);
      })
      .catch(notifyError);
    return () => {
      cancelled = true;
    };
  }, [repo, path, from]);

  useEffect(() => {
    if (!entry || !blaming) {
      setBlame(null);
      return;
    }
    let cancelled = false;
    ipc
      .blameFile(repo, entry.path, entry.hash)
      .then((spans) => {
        if (!cancelled) setBlame(spans);
      })
      .catch(() => setBlame(null));
    return () => {
      cancelled = true;
    };
  }, [repo, path, entry?.hash, blaming]);

  useEffect(() => {
    if (!entry) return;
    setUpMonaco();
    editors.current.forEach((editor) => editor.dispose());
    editors.current = [];
    setScrollTop(0);

    let cancelled = false;
    const at = entry.path;
    Promise.all([
      ipc.diffSides(repo, entry.hash, at, entry.oldPath ?? null),
      ipc.commitFileHunks(repo, entry.hash, at).catch(() => null),
    ])
      .then(([sides, raw]) => {
        if (cancelled) return;
        const language = languageOf(at);
        if (view === 'file' && fileHost.current) {
          const editor = monaco.editor.create(fileHost.current, {
            ...EDITOR_BASE,
            ...userEditorOptions(),
            wordWrap: diffLook.current.wrap ? 'on' : 'off',
            value: sides.after,
            language,
          });
          editor.onDidScrollChange((e) => setScrollTop(e.scrollTop));
          editors.current.push(editor);
        }
        if (view === 'diff' && diffHost.current) {
          const editor = monaco.editor.createDiffEditor(diffHost.current, {
            ...DIFF_EDITOR_BASE,
            ...userEditorOptions(),
            ...editorOptionsFor(diffLook.current.mode),
            ignoreTrimWhitespace: diffLook.current.whitespace,
            diffWordWrap: diffLook.current.wrap ? 'on' : 'off',
          });
          editor.setModel({
            original: monaco.editor.createModel(sides.before, language),
            modified: monaco.editor.createModel(sides.after, language),
          });
          const parsed = raw && !isGitlinkDiff(raw) ? parseUnifiedDiff(raw) : null;
          hunkSpans.current = parsed
            ? hiddenSpans(
                parsed.hunks,
                sides.before.split('\n').length,
                sides.after.split('\n').length,
              )
            : null;
          hideOutsideHunks(editor, diffLook.current.mode === 'hunk' ? hunkSpans.current : null);
          if (diffLook.current.mode === 'hunk') {
            editor.getModifiedEditor().setScrollTop(0);
          } else if (parsed) {
            editor
              .getModifiedEditor()
              .revealLineNearTop(parsed.hunks[0].newStart, monaco.editor.ScrollType.Immediate);
          } else {
            editor.revealFirstDiff();
          }
          diffEditor.current = editor;
          editors.current.push(editor);
        }
      })
      .catch(notifyError);

    return () => {
      cancelled = true;
      editors.current.forEach((editor) => editor.dispose());
      editors.current = [];
      diffEditor.current = null;
    };
  }, [repo, path, entry?.hash, view]);

  useEffect(() => {
    diffEditor.current?.updateOptions({
      ...editorOptionsFor(mode),
      ignoreTrimWhitespace: whitespace,
      diffWordWrap: wrap ? 'on' : 'off',
    });
    diffEditor.current?.getModifiedEditor().updateOptions({ wordWrap: wrap ? 'on' : 'off' });
    diffEditor.current?.getOriginalEditor().updateOptions({ wordWrap: wrap ? 'on' : 'off' });
    if (diffEditor.current) {
      hideOutsideHunks(diffEditor.current, mode === 'hunk' ? hunkSpans.current : null);
    }
  }, [mode, whitespace, wrap]);

  const now = Date.now() / 1000;
  const born = commits[commits.length - 1];

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <ViewBar>
        <span className="text-muted-foreground shrink-0 text-xs">{t('history.title')}</span>
        <span className="flex min-w-0 items-baseline text-xs">
          <span className="text-muted-foreground shrink-0">
            {shortenDirectory(splitPath(path).directory, 46)}
          </span>
          <span className="text-foreground truncate font-medium">{splitPath(path).name}</span>
        </span>

        <span className="flex-1" />

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
        onStep={(where) => diffEditor.current?.goToDiff(where)}
        extra={
          <Button
            variant={blaming ? 'secondary' : 'action'}
            size="xs"
            className="shrink-0"
            onClick={() => setBlaming((now) => !now)}
          >
            {t('history.blame')}
          </Button>
        }
      />

      <div className="flex min-h-0 flex-1">
        <div className="border-border flex w-80 shrink-0 flex-col overflow-y-auto border-r">
          {history !== null && commits.length === 0 ? (
            <InlineNote>{t('history.empty')}</InlineNote>
          ) : null}
          <ul>
            {commits.map((commit) => (
              <li key={commit.hash}>
                <ListRow
                  tall
                  current={commit.hash === entry?.hash}
                  onClick={() => setChosen(commit.hash)}
                >
                  <CommitAvatar avatars={avatars} email={commit.email} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm leading-tight font-normal">
                      {commit.subject}
                    </span>
                    <span className="text-muted-foreground block truncate pt-0.5 text-2xs leading-tight font-normal">
                      {t('history.when', {
                        when: relativeTime(commit.time, now, i18n.language),
                        author: commit.author,
                      })}
                    </span>
                  </span>
                  <span className="text-muted-foreground shrink-0 font-mono text-2xs font-normal">
                    {commit.hash.slice(0, 7)}
                  </span>
                </ListRow>
              </li>
            ))}
          </ul>
          {born && born.status === 'A' ? (
            <>
              <p className="border-added/50 text-added border-t px-2 py-1.5 text-2xs">
                {t('history.added', { path: born.path })}
              </p>
              <p className="text-muted-foreground py-1 text-center text-2xs">{t('history.end')}</p>
            </>
          ) : null}
        </div>

        <div className="flex min-h-0 min-w-0 flex-1">
          {view === 'file' && blaming && blame ? (
            <BlameGutter spans={blame} scrollTop={scrollTop} onPick={setChosen} />
          ) : null}
          <div
            ref={fileHost}
            className={cn('min-h-0 min-w-0 flex-1', view !== 'file' && 'hidden')}
          />
          <div
            ref={diffHost}
            className={cn('min-h-0 min-w-0 flex-1', view !== 'diff' && 'hidden')}
          />
        </div>
      </div>
    </div>
  );
}
