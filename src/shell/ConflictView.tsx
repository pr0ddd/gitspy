import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Hint } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import * as ipc from '../ipc';
import { notifyError } from '../toast';
import { Icon } from '../icons';
import { SectionHeader, ViewBar } from './parts';
import { shortenDirectory, splitPath } from '../paths';
import {
  composeOutput,
  emptyPicks,
  parseConflictFile,
  type ConflictBlock,
  type Picks,
} from '../conflictFile';
import type { ConflictFileView, WorkingTreeView } from '../types';

type Props = {
  repo: string;
  path: string;
  from: string | null;
  into: string | null;
  onClose: () => void;
  onResolved: (tree: WorkingTreeView) => void;
};

type Side = 'a' | 'b';

const SIDE_ROW: Record<Side, string> = {
  a: 'border-ahead bg-ahead/20',
  b: 'border-modified bg-modified/20',
};

const SIDE_TEXT: Record<Side, string> = {
  a: 'text-ahead',
  b: 'text-modified',
};

function Row({
  no,
  text,
  tint,
  mark,
  picked,
  onToggle,
}: {
  no: number | null;
  text: string;
  tint?: string;
  mark?: string;
  picked?: boolean;
  onToggle?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      onClick={onToggle}
      className={cn(
        'group flex h-5 items-center gap-1.5 border-l-2 border-transparent pr-2',
        onToggle && 'cursor-pointer',
        tint,
      )}
    >
      <span className="text-muted-foreground w-6 shrink-0 text-right font-mono text-2xs select-none">
        {mark ?? no ?? ''}
      </span>
      {onToggle ? (
        <>
          <Checkbox
            checked={picked === true}
            onCheckedChange={onToggle}
            onClick={(e) => e.stopPropagation()}
            className="size-3.5"
          />
          <Hint text={picked ? t('conflict.dontTakeLine') : t('conflict.takeLine')}>
            <span className="invisible shrink-0 group-hover:visible">
              {picked ? (
                <Icon.remove className="text-deleted size-3.5" />
              ) : (
                <Icon.add className="text-added size-3.5" />
              )}
            </span>
          </Hint>
        </>
      ) : (
        <span className="w-3.5 shrink-0" />
      )}
      <span className="min-w-0 flex-1 truncate font-mono text-xs whitespace-pre select-none">
        {text || ' '}
      </span>
    </div>
  );
}

function SidePane({
  side,
  branch,
  blocks,
  picks,
  onToggle,
  onAll,
  refFor,
}: {
  side: Side;
  branch: string | null;
  blocks: ConflictBlock[];
  picks: Picks;
  onToggle: (block: number, line: number) => void;
  onAll: (take: boolean) => void;
  refFor: (el: HTMLDivElement | null) => void;
}) {
  const { t } = useTranslation();
  const lines = side === 'a' ? (b: ConflictBlock & { kind: 'conflict' }) => b.ours : (b: ConflictBlock & { kind: 'conflict' }) => b.theirs;
  const chosen = (at: number) => (side === 'a' ? picks[at]?.a : picks[at]?.b) ?? new Set();
  const every = blocks.every((block, at) =>
    block.kind !== 'conflict' || lines(block).every((_, i) => chosen(at).has(i)),
  );

  let no = 0;
  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <SectionHeader>
        <Checkbox
          checked={every}
          onCheckedChange={(next) => onAll(next === true)}
          className="size-3.5"
        />
        <Badge className="bg-fill-2 text-muted-foreground text-2xs rounded-md px-2 py-0.5">
          {side === 'a' ? t('conflict.sideA') : t('conflict.sideB')}
        </Badge>
        <span className="min-w-0 flex-1 truncate text-left">{branch ?? ''}</span>
      </SectionHeader>
      <div ref={refFor} className="min-h-0 flex-1 overflow-auto py-1">
        {blocks.map((block, at) => {
          if (block.kind === 'common') {
            return block.lines.map((line, i) => <Row key={`${at}:${i}`} no={++no} text={line} />);
          }
          return (
            <div key={at} data-conflict={at}>
              {lines(block).map((line, i) => (
                <Row
                  key={i}
                  no={++no}
                  text={line}
                  tint={SIDE_ROW[side]}
                  picked={chosen(at).has(i)}
                  onToggle={() => onToggle(at, i)}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ConflictView({ repo, path, from, into, onClose, onResolved }: Props) {
  const { t } = useTranslation();
  const [file, setFile] = useState<ConflictFileView | null>(null);
  const [saving, setSaving] = useState(false);
  const blocks = useMemo(() => (file ? parseConflictFile(file.merged) : []), [file]);
  const [picks, setPicks] = useState<Picks>({});
  const conflicts = useMemo(
    () => blocks.flatMap((block, at) => (block.kind === 'conflict' ? [at] : [])),
    [blocks],
  );
  const [shown, setShown] = useState(0);
  const panes = useRef<(HTMLDivElement | null)[]>([null, null, null]);

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

  const toggle = (side: Side, block: number, line: number) =>
    setPicks((prev) => {
      const pick = prev[block] ?? { a: new Set<number>(), b: new Set<number>() };
      const next = new Set(pick[side]);
      if (next.has(line)) next.delete(line);
      else next.add(line);
      return { ...prev, [block]: { ...pick, [side]: next } };
    });

  const takeAll = (side: Side, take: boolean) =>
    setPicks((prev) => {
      const next: Picks = { ...prev };
      blocks.forEach((block, at) => {
        if (block.kind !== 'conflict') return;
        const pick = next[at] ?? { a: new Set<number>(), b: new Set<number>() };
        const lines = side === 'a' ? block.ours : block.theirs;
        next[at] = {
          ...pick,
          [side]: take ? new Set(lines.map((_, i) => i)) : new Set<number>(),
        };
      });
      return next;
    });

  const goto = (step: number) => {
    if (!conflicts.length) return;
    const next = (shown + step + conflicts.length) % conflicts.length;
    setShown(next);
    for (const pane of panes.current) {
      pane
        ?.querySelector(`[data-conflict="${conflicts[next]}"]`)
        ?.scrollIntoView({ block: 'center' });
    }
  };

  const save = () => {
    setSaving(true);
    ipc
      .resolveConflict(repo, path, composeOutput(blocks, picks))
      .then(onResolved)
      .catch(notifyError)
      .finally(() => setSaving(false));
  };

  let outNo = 0;
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

        <Button size="xs" className="ml-auto shrink-0" disabled={!file || saving} onClick={save}>
          <Icon.resolve className="size-3.5" />
          {t('conflict.markResolved')}
        </Button>

        <Hint text={t('diff.close')}>
          <Button variant="ghost" size="icon" className="size-6 shrink-0" onClick={onClose}>
            <Icon.close className="size-3.5" />
          </Button>
        </Hint>
      </ViewBar>

      <div className="border-border grid min-h-0 flex-1 grid-cols-2 [&>*:first-child]:border-r [&>*:first-child]:border-border">
        <SidePane
          side="a"
          branch={into}
          blocks={blocks}
          picks={picks}
          onToggle={(block, line) => toggle('a', block, line)}
          onAll={(take) => takeAll('a', take)}
          refFor={(el) => {
            panes.current[0] = el;
          }}
        />
        <SidePane
          side="b"
          branch={from}
          blocks={blocks}
          picks={picks}
          onToggle={(block, line) => toggle('b', block, line)}
          onAll={(take) => takeAll('b', take)}
          refFor={(el) => {
            panes.current[1] = el;
          }}
        />
      </div>

      <div className="border-border flex min-h-0 flex-1 flex-col border-t">
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
            panes.current[2] = el;
          }}
          role="region"
          aria-label={t('conflict.output')}
          className="min-h-0 flex-1 overflow-auto py-1"
        >
          {blocks.map((block, at) => {
            if (block.kind === 'common') {
              return block.lines.map((line, i) => (
                <Row key={`${at}:${i}`} no={++outNo} text={line} />
              ));
            }
            const pick = picks[at] ?? { a: new Set<number>(), b: new Set<number>() };
            const untouched = pick.a.size === 0 && pick.b.size === 0;
            return (
              <div key={at} data-conflict={at}>
                {untouched
                  ? block.base.map((line, i) => (
                      <Row key={`base:${i}`} no={null} text={line} tint="border-ref-stash bg-ref-stash/20" />
                    ))
                  : null}
                {block.ours.map((line, i) =>
                  pick.a.has(i) ? (
                    <Row
                      key={`a:${i}`}
                      no={++outNo}
                      mark={t('conflict.sideA')}
                      text={line}
                      tint={cn(SIDE_ROW.a, SIDE_TEXT.a)}
                      picked
                      onToggle={() => toggle('a', at, i)}
                    />
                  ) : null,
                )}
                {block.theirs.map((line, i) =>
                  pick.b.has(i) ? (
                    <Row
                      key={`b:${i}`}
                      no={++outNo}
                      mark={t('conflict.sideB')}
                      text={line}
                      tint={cn(SIDE_ROW.b, SIDE_TEXT.b)}
                      picked
                      onToggle={() => toggle('b', at, i)}
                    />
                  ) : null,
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
