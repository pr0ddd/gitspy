import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { parseUnifiedDiff, reviewLines, type ReviewLine } from '@/entities/diff';
import { Icon } from '@/icons';
import { workingTreeHunks } from '@/ipc';
import { cn } from '@/lib/utils';
import { FilePath, InlineNote, ListRow, StatusBadge } from '@/parts';
import { notifyError } from '@/toast';
import type { StatusEntryView, WorkingTreeView } from '@/types';

type Props = {
  repo: string;
  tree: WorkingTreeView;
  onOpenFile: (entry: StatusEntryView) => void;
};

const LINE_TONE: Record<string, string> = {
  added: 'bg-added/10',
  removed: 'bg-deleted/10',
  context: '',
};

const SIGN: Record<string, string> = { added: '+', removed: '−', context: ' ' };

const keyOf = (entry: StatusEntryView): string => `${entry.staged ? 's' : 'u'}:${entry.path}`;

function PieceRow({ piece }: { piece: ReviewLine }) {
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
  const [reads, setReads] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const toggle = useCallback(
    (entry: StatusEntryView) => {
      const key = keyOf(entry);
      setOpen((shown) => ({ ...shown, [key]: !shown[key] }));
      setReads((known) => {
        if (known[key] !== undefined) return known;
        workingTreeHunks(repo, entry.path, entry.staged)
          .then((patch) => setReads((have) => ({ ...have, [key]: patch })))
          .catch(notifyError);
        return known;
      });
    },
    [repo],
  );

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tree.entries.length === 0 ? (
          <InlineNote>{t('review.clean')}</InlineNote>
        ) : (
          <InlineNote>{t('review.collapsed')}</InlineNote>
        )}
        {tree.entries.map((entry) => {
          const key = keyOf(entry);
          const read = reads[key];
          const diff = read === undefined ? null : parseUnifiedDiff(read);
          const lines = diff ? reviewLines(diff) : [];
          return (
            <div key={key}>
              <div className={cn('bg-card', open[key] && 'sticky top-0 z-10')}>
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
              </div>
              {open[key] ? (
                read === undefined ? (
                  <InlineNote>{t('review.reading')}</InlineNote>
                ) : lines.length === 0 ? (
                  <InlineNote>{t('review.noText')}</InlineNote>
                ) : (
                  <div className="border-border border-y">
                    {lines.map((line, at) => (
                      <PieceRow key={`line-${at}`} piece={line} />
                    ))}
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
