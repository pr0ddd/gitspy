import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Hint } from '@/shared/ui/tooltip';
import * as ipc from '@/shared/api/ipc';
import { runRepoWork, useRepoWork } from '@/features/repo';
import { notifyError } from '@/shared/ui/toast';
import { Icon } from '@/shared/ui/icons';
import { ResizeGrip, SectionHeader, ViewBar } from '@/shared/ui/parts';
import { shortenDirectory, splitPath } from '@/shared/lib/paths';
import { useShareUnderCursor } from '@/shared/lib/resize';
import {
  blockState,
  EDITOR_BASE,
  emptyPicks,
  gutterTarget,
  languageOf,
  monaco,
  outputLayout,
  paneLayout,
  parseConflictFile,
  setUpMonaco,
  userEditorOptions,
  withBlock,
  withEverySide,
  withLine,
  type ConflictSide,
  type Picks,
} from '@/entities/diff';
import type { ConflictFileView, WorkingTreeView } from '@/shared/api/types';
import { sideDecorations, outputDecorations, boxCentres } from './decorations';
type Props = {
  repo: string;
  path: string;
  from: string | null;
  into: string | null;
  onClose: () => void;
  onResolved: (tree: WorkingTreeView) => void;
};

const CONFLICT_EDITOR = {
  ...EDITOR_BASE,
  glyphMargin: false,
  lineDecorationsWidth: 18,
  folding: false,
  stickyScroll: { enabled: false },
  minimap: { enabled: false },
  renderLineHighlight: 'none',
  occurrencesHighlight: 'off',
  selectionHighlight: false,
  scrollbar: { alwaysConsumeMouseWheel: false },
} as const;

type Editors = {
  a: monaco.editor.IStandaloneCodeEditor;
  b: monaco.editor.IStandaloneCodeEditor;
  out: monaco.editor.IStandaloneCodeEditor;
};

const OUTPUT_SHARE = { fallback: 0.4, min: 0.2, max: 0.75 } as const;
const SIDE_B_SHARE = { fallback: 0.5, min: 0.25, max: 0.75 } as const;

export function ConflictView({ repo, path, from, into, onClose, onResolved }: Props) {
  const { t } = useTranslation();
  const [file, setFile] = useState<ConflictFileView | null>(null);
  const work = useRepoWork(repo);
  const blocks = useMemo(() => (file ? parseConflictFile(file.merged) : []), [file]);
  const [picks, setPicks] = useState<Picks>({});
  const conflicts = useMemo(
    () => blocks.flatMap((block, at) => (block.kind === 'conflict' ? [at] : [])),
    [blocks],
  );
  const [shown, setShown] = useState(0);
  const outputShare = useShareUnderCursor(
    'conflict.output.share',
    OUTPUT_SHARE.fallback,
    OUTPUT_SHARE.min,
    OUTPUT_SHARE.max,
  );
  const sideBShare = useShareUnderCursor(
    'conflict.sideB.share',
    SIDE_B_SHARE.fallback,
    SIDE_B_SHARE.min,
    SIDE_B_SHARE.max,
  );
  const outputPane = useRef<HTMLDivElement | null>(null);
  const sideBPane = useRef<HTMLDivElement | null>(null);
  const hosts = useRef<{
    a: HTMLDivElement | null;
    b: HTMLDivElement | null;
    out: HTMLDivElement | null;
  }>({
    a: null,
    b: null,
    out: null,
  });
  const editors = useRef<Editors | null>(null);
  const decorations = useRef<{
    a: monaco.editor.IEditorDecorationsCollection | null;
    b: monaco.editor.IEditorDecorationsCollection | null;
    out: monaco.editor.IEditorDecorationsCollection | null;
  }>({ a: null, b: null, out: null });
  const [hovered, setHovered] = useState<{ pane: ConflictSide | 'out'; line: number } | null>(null);
  const [boxes, setBoxes] = useState<Record<ConflictSide, Array<{ at: number; centre: number }>>>({
    a: [],
    b: [],
  });
  const picksRef = useRef(picks);
  picksRef.current = picks;
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  const layouts = useMemo(
    () => ({
      a: paneLayout(blocks, 'a'),
      b: paneLayout(blocks, 'b'),
      out: outputLayout(blocks, picks),
    }),
    [blocks, picks],
  );
  const layoutsRef = useRef(layouts);
  layoutsRef.current = layouts;

  useEffect(() => {
    let cancelled = false;
    ipc
      .conflictFile(repo, path)
      .then((sides) => {
        if (!cancelled) setFile(sides);
      })
      .catch(notifyError);
    return () => {
      cancelled = true;
    };
  }, [repo, path]);

  useEffect(() => {
    setPicks(emptyPicks(blocks));
    setShown(0);
  }, [blocks]);

  const onGutter = useCallback(
    (side: ConflictSide | 'out', kind: 'glyph' | 'line', line: number) => {
      const now = layoutsRef.current;
      const currentBlocks = blocksRef.current;
      if (side === 'out') {
        const origin = now.out.origins.find((o) => o.line === line);
        if (!origin || origin.side === 'base') return;
        const from = origin.side;
        setPicks((prev) => withLine(prev, from, origin.at, origin.index));
        return;
      }
      const hit = gutterTarget(now[side], line);
      if (!hit) return;
      const block = currentBlocks[hit.at];
      if (block?.kind !== 'conflict') return;
      if (kind === 'glyph' || hit.index === null) return;
      setPicks((prev) => withLine(prev, side, hit.at, hit.index as number));
    },
    [],
  );

  useEffect(() => {
    const a = hosts.current.a;
    const b = hosts.current.b;
    const out = hosts.current.out;
    if (!file || !a || !b || !out) return;
    setUpMonaco();
    const language = languageOf(path);
    const options = { ...CONFLICT_EDITOR, ...userEditorOptions() };
    const created: Editors = {
      a: monaco.editor.create(a, {
        ...options,
        readOnly: true,
        model: monaco.editor.createModel(layoutsRef.current.a.text, language),
      }),
      b: monaco.editor.create(b, {
        ...options,
        readOnly: true,
        model: monaco.editor.createModel(layoutsRef.current.b.text, language),
      }),
      out: monaco.editor.create(out, {
        ...options,
        readOnly: false,
        model: monaco.editor.createModel(layoutsRef.current.out.text, language),
      }),
    };
    editors.current = created;
    decorations.current = {
      a: created.a.createDecorationsCollection(),
      b: created.b.createDecorationsCollection(),
      out: created.out.createDecorationsCollection(),
    };
    created.out.getDomNode()?.setAttribute('data-editing', 'true');

    const listeners: monaco.IDisposable[] = [];
    let syncing = false;
    const all = [created.a, created.b, created.out];
    for (const editor of all) {
      listeners.push(
        editor.onDidScrollChange((event) => {
          if (!event.scrollTopChanged) return;
          if (!syncing) {
            syncing = true;
            for (const other of all) {
              if (other !== editor && other.getScrollTop() !== event.scrollTop) {
                other.setScrollTop(event.scrollTop);
              }
            }
            syncing = false;
          }
          setBoxes({
            a: boxCentres(created.a, layoutsRef.current.a),
            b: boxCentres(created.b, layoutsRef.current.b),
          });
        }),
      );
    }
    const gutterOf = (side: ConflictSide | 'out', editor: monaco.editor.IStandaloneCodeEditor) =>
      editor.onMouseDown((event) => {
        const line = event.target.position?.lineNumber;
        if (!line) return;
        if (event.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
          onGutter(side, 'glyph', line);
        } else if (event.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_DECORATIONS) {
          onGutter(side, 'line', line);
        }
      });
    listeners.push(
      gutterOf('a', created.a),
      gutterOf('b', created.b),
      gutterOf('out', created.out),
    );
    const hoverOf = (pane: ConflictSide | 'out', editor: monaco.editor.IStandaloneCodeEditor) => [
      editor.onMouseMove((event) => {
        const line = event.target.position?.lineNumber ?? null;
        setHovered((now) =>
          line === null
            ? now?.pane === pane
              ? null
              : now
            : now?.pane === pane && now.line === line
              ? now
              : { pane, line },
        );
      }),
      editor.onMouseLeave(() => setHovered((now) => (now?.pane === pane ? null : now))),
    ];
    listeners.push(
      ...hoverOf('a', created.a),
      ...hoverOf('b', created.b),
      ...hoverOf('out', created.out),
    );

    const firstPlace = layoutsRef.current.a.places[0];
    if (firstPlace) created.a.revealLineNearTop(Math.max(1, firstPlace.from - 2));

    return () => {
      for (const listener of listeners) listener.dispose();
      for (const editor of all) {
        editor.getModel()?.dispose();
        editor.dispose();
      }
      editors.current = null;
      decorations.current = { a: null, b: null, out: null };
    };
  }, [file, path, onGutter]);

  useEffect(() => {
    const created = editors.current;
    if (!created) return;
    const outModel = created.out.getModel();
    if (outModel && outModel.getValue() !== layouts.out.text) outModel.setValue(layouts.out.text);
    const hoverIn = (pane: ConflictSide | 'out') => (hovered?.pane === pane ? hovered.line : null);
    decorations.current.a?.set(sideDecorations(blocks, 'a', layouts.a, picks, hoverIn('a')));
    decorations.current.b?.set(sideDecorations(blocks, 'b', layouts.b, picks, hoverIn('b')));
    decorations.current.out?.set(outputDecorations(layouts.out, hoverIn('out')));
    setBoxes({ a: boxCentres(created.a, layouts.a), b: boxCentres(created.b, layouts.b) });
  }, [blocks, layouts, picks, file, hovered]);

  const goto = (step: number) => {
    if (!conflicts.length) return;
    const next = (shown + step + conflicts.length) % conflicts.length;
    setShown(next);
    const at = conflicts[next];
    const created = editors.current;
    if (!created) return;
    const place = layouts.a.places.find((p) => p.at === at);
    if (place) created.a.revealLineInCenter(Math.max(1, place.from));
  };

  const save = () => {
    const text = editors.current?.out.getValue() ?? layouts.out.text;
    void runRepoWork(repo, { kind: 'resolveConflict', target: path }, () =>
      ipc.resolveConflict(repo, path, text).then(onResolved),
    );
  };

  const everyOn = (side: ConflictSide) =>
    blocks.every(
      (block, at) => block.kind !== 'conflict' || blockState(block, side, picks, at) === 'all',
    );

  const pane = (side: ConflictSide, branch: string | null) => (
    <div
      ref={side === 'b' ? sideBPane : undefined}
      className={
        side === 'a'
          ? 'flex min-h-0 min-w-0 flex-1 flex-col'
          : 'border-border relative flex min-h-0 shrink-0 flex-col border-l'
      }
      style={side === 'b' ? { width: `${sideBShare.shown * 100}%` } : undefined}
    >
      {side === 'b' ? (
        <ResizeGrip
          name="conflict-sides"
          label={t('conflict.resizeSides')}
          edge="left"
          onStart={sideBShare.begin}
          onMove={(delta) => sideBShare.moved(sideBPane.current, delta, 'x')}
          onEnd={sideBShare.commit}
        />
      ) : null}
      <SectionHeader>
        <Checkbox
          checked={everyOn(side)}
          onCheckedChange={(next) =>
            setPicks((prev) => withEverySide(prev, blocks, side, next === true))
          }
          className="size-3.5"
          aria-label={t(side === 'a' ? 'conflict.takeAllA' : 'conflict.takeAllB')}
        />
        <Badge className="bg-fill-2 text-muted-foreground text-2xs rounded-md px-2 py-0.5">
          {side === 'a' ? t('conflict.sideA') : t('conflict.sideB')}
        </Badge>
        <span className="min-w-0 flex-1 truncate text-left">{branch ?? ''}</span>
      </SectionHeader>
      <div className="flex min-h-0 flex-1">
        <div className="relative w-6 shrink-0 overflow-hidden">
          {boxes[side].map((box) => {
            const block = blocks[box.at];
            if (block?.kind !== 'conflict') return null;
            const state = blockState(block, side, picks, box.at);
            return (
              <Checkbox
                key={box.at}
                className="absolute left-1.5 size-3.5"
                style={{ top: box.centre - 7 }}
                checked={state === 'all' ? true : state === 'some' ? 'indeterminate' : false}
                onCheckedChange={() =>
                  setPicks((prev) => withBlock(prev, blocks, side, box.at, state !== 'all'))
                }
                aria-label={t(side === 'a' ? 'conflict.takeBlockA' : 'conflict.takeBlockB', {
                  n: conflicts.indexOf(box.at) + 1,
                })}
              />
            );
          })}
        </div>
        <div
          ref={(el) => {
            hosts.current[side] = el;
          }}
          data-area="text"
          className="min-h-0 min-w-0 flex-1"
        />
      </div>
    </div>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <ViewBar>
        <Icon.conflict className="text-conflict size-3.5 shrink-0" />
        <span className="flex min-w-0 items-baseline text-xs">
          <span className="text-muted-foreground shrink-0">
            {shortenDirectory(splitPath(path).directory, 46)}
          </span>
          <span className="text-foreground truncate font-medium">{splitPath(path).name}</span>
        </span>
        <span className="text-muted-foreground shrink-0 text-xs">
          {t('conflict.count', { count: conflicts.length })}
        </span>

        <Button
          size="xs"
          className="ml-auto shrink-0"
          disabled={!file || work !== null}
          onClick={save}
        >
          <Icon.save className="size-3.5" />
          {t('conflict.save')}
        </Button>

        <Hint text={t('diff.close')}>
          <Button variant="ghost" size="icon" className="size-6 shrink-0" onClick={onClose}>
            <Icon.close className="size-3.5" />
          </Button>
        </Hint>
      </ViewBar>

      <div className="flex min-h-0 min-w-0 flex-1">
        {pane('a', into)}
        {pane('b', from)}
      </div>

      <div
        ref={outputPane}
        className="border-border relative flex min-h-0 shrink-0 flex-col border-t"
        style={{ height: `${outputShare.shown * 100}%` }}
      >
        <ResizeGrip
          name="conflict-output"
          label={t('conflict.resizeOutput')}
          edge="top"
          onStart={outputShare.begin}
          onMove={(delta) => outputShare.moved(outputPane.current, delta, 'y')}
          onEnd={outputShare.commit}
        />
        <SectionHeader>
          <span className="min-w-0 flex-1 truncate text-left">{t('conflict.output')}</span>
          <span className="normal-case tabular-nums">
            {conflicts.length
              ? t('conflict.counter', { n: shown + 1, total: conflicts.length })
              : null}
          </span>
          <Button variant="ghost" size="icon" className="size-5" onClick={() => goto(-1)}>
            <Icon.up className="size-3" />
          </Button>
          <Button variant="ghost" size="icon" className="size-5" onClick={() => goto(1)}>
            <Icon.down className="size-3" />
          </Button>
        </SectionHeader>
        <div
          ref={(el) => {
            hosts.current.out = el;
          }}
          role="region"
          aria-label={t('conflict.output')}
          data-area="text"
          className="min-h-0 flex-1"
        />
      </div>
    </div>
  );
}
