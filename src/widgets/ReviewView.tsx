import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  expandedAround,
  parseUnifiedDiff,
  reviewPieces,
  type OpenedSpan,
  type ReviewGap,
  type ReviewPiece,
} from '@/entities/diff';
import { Icon } from '@/icons';
import { workingTreeHunks } from '@/ipc';
import { cn } from '@/lib/utils';
import { FilePath, InlineNote, ListRow, StatusBadge, ViewBar } from '@/parts';
import { notifyError } from '@/toast';
import type { StatusEntryView, WorkingTreeView } from '@/types';

type Props = {
  repo: string;
  tree: WorkingTreeView;
  onOpenFile: (entry: StatusEntryView) => void;
};

const CONTEXT_STEP = 20;

const LINE_TONE: Record<string, string> = {
  added: 'bg-added/10',
  removed: 'bg-deleted/10',
  context: '',
};

const SIGN: Record<string, string> = { added: '+', removed: '−', context: ' ' };

const keyOf = (entry: StatusEntryView): string => `${entry.staged ? 's' : 'u'}:${entry.path}`;

type Read = { patch: string; opened: OpenedSpan[] };

function GapRow({ gap, onOpen }: { gap: ReviewGap; onOpen: () => void }) {
  const { t } = useTranslation();
  return (
    <Button
      variant="action"
      size="2xs"
      className="w-full justify-start"
      onClick={onOpen}
      aria-label={t('review.hidden', { count: gap.hidden })}
    >
      <Icon.chevron />
      {t('review.hidden', { count: gap.hidden })}
    </Button>
  );
}

function PieceRow({ piece }: { piece: ReviewPiece }) {
  if (piece.kind === 'gap') return null;
  return (
    <div className={cn('flex font-mono text-xs leading-5', LINE_TONE[piece.kind])}>
      <span className="text-muted-foreground/60 w-12 shrink-0 pr-2 text-right tabular-nums select-none">
        {piece.before ?? ''}
      </span>
      <span className="text-muted-foreground/60 w-12 shrink-0 pr-2 text-right tabular-nums select-none">
        {piece.after ?? ''}
      </span>
      <span className="w-4 shrink-0 text-center select-none">{SIGN[piece.kind]}</span>
      <span className="min-w-0 flex-1 break-all whitespace-pre-wrap">{piece.text}</span>
    </div>
  );
}

export function ReviewView({ repo, tree, onOpenFile }: Props) {
  const { t } = useTranslation();
  const [reads, setReads] = useState<Record<string, Read>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const toggle = useCallback(
    (entry: StatusEntryView) => {
      const key = keyOf(entry);
      setOpen((shown) => ({ ...shown, [key]: !shown[key] }));
      setReads((known) => {
        if (known[key]) return known;
        workingTreeHunks(repo, entry.path, entry.staged)
          .then((patch) => setReads((have) => ({ ...have, [key]: { patch, opened: [] } })))
          .catch(notifyError);
        return known;
      });
    },
    [repo],
  );

  const widen = useCallback((key: string, gap: ReviewGap) => {
    setReads((known) => {
      const read = known[key];
      if (!read) return known;
      return {
        ...known,
        [key]: { ...read, opened: [...read.opened, expandedAround(gap, CONTEXT_STEP)] },
      };
    });
  }, []);

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <ViewBar>
        <Icon.branch className="size-3.5 shrink-0 opacity-75" />
        <span className="min-w-0 truncate">
          {t('review.title', { branch: tree.branch ?? t('review.detached') })}
        </span>
      </ViewBar>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <InlineNote>{t('review.collapsed')}</InlineNote>
        {tree.entries.map((entry) => {
          const key = keyOf(entry);
          const read = reads[key];
          const diff = read ? parseUnifiedDiff(read.patch) : null;
          const pieces = diff ? reviewPieces(diff, read.opened) : [];
          return (
            <div key={key}>
              <ListRow as="button" current={open[key]} onClick={() => toggle(entry)}>
                <Icon.chevron className={cn('size-3 shrink-0', open[key] && 'rotate-90')} />
                <StatusBadge letter={entry.letter} />
                <span className="min-w-0 flex-1 truncate text-left">
                  <FilePath path={entry.path} />
                </span>
                <Button
                  variant="muted"
                  size="icon-2xs"
                  reveal
                  aria-label={t('review.openFile')}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenFile(entry);
                  }}
                >
                  <Icon.open />
                </Button>
              </ListRow>
              {open[key] ? (
                read === undefined ? (
                  <InlineNote>{t('review.reading')}</InlineNote>
                ) : pieces.length === 0 ? (
                  <InlineNote>{t('review.noText')}</InlineNote>
                ) : (
                  <div className="border-border border-y">
                    {pieces.map((piece, at) =>
                      piece.kind === 'gap' ? (
                        <GapRow
                          key={`gap-${piece.from}`}
                          gap={piece}
                          onOpen={() => widen(key, piece)}
                        />
                      ) : (
                        <PieceRow key={`line-${at}`} piece={piece} />
                      ),
                    )}
                  </div>
                )
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
