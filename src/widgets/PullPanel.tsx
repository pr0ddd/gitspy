import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { Separator } from '@/shared/ui/separator';
import { Icon } from '@/shared/ui/icons';
import { PanelBar, Prose, ViewBar } from '@/shared/ui/parts';
import * as ipc from '@/shared/api/ipc';
import { runRepoWork, useRepoWork } from '@/features/repo';
import { notifyError } from '@/shared/ui/toast';
import type { PullCardView, PullView } from '@/shared/api/types';
import { Hint } from '@/shared/ui/tooltip';

type Props = {
  repo: string;
  pull: PullView;
  onCheckedOut: () => void;
  onClose: () => void;
};

export function PullPanel({ repo, pull, onCheckedOut, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const [card, setCard] = useState<PullCardView | null>(null);
  const work = useRepoWork(repo);

  useEffect(() => {
    let alive = true;
    setCard(null);
    ipc
      .pullCard(repo, pull.number)
      .then((found) => alive && setCard(found))
      .catch(notifyError);
    return () => {
      alive = false;
    };
  }, [repo, pull.number]);

  const checkout = () => {
    void runRepoWork(repo, { kind: 'checkout', target: pull.headBranch }, () =>
      ipc.checkoutPull(repo, pull.number, pull.headBranch, pull.fromFork).then(onCheckedOut),
    );
  };

  const relative = new Intl.RelativeTimeFormat(i18n.language, {
    numeric: 'auto',
  });
  const ago = (iso: string) => {
    const delta = Math.round((Date.parse(iso) - Date.now()) / 1000);
    if (!Number.isFinite(delta)) return '';
    if (Math.abs(delta) < 3600) return relative.format(Math.round(delta / 60), 'minute');
    if (Math.abs(delta) < 86400) return relative.format(Math.round(delta / 3600), 'hour');
    return relative.format(Math.round(delta / 86400), 'day');
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <ViewBar>
        <Icon.pullRequest className="text-muted-foreground size-3.5 shrink-0" />
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">#{pull.number}</span>
        <span className="truncate text-sm font-medium">{pull.title}</span>
        <Badge
          className={cn(
            'bg-fill-2 text-2xs shrink-0 rounded-md px-2 py-0.5',
            pull.draft ? 'text-behind' : 'text-added',
          )}
        >
          {pull.draft ? t('pull.draft') : t('pull.open')}
        </Badge>

        <Button size="xs" disabled={work !== null} onClick={checkout} className="ml-auto shrink-0">
          <Icon.branch className="size-3" />
          {t('pull.checkout')}
        </Button>
        <Hint text={t('diff.close')}>
          <Button variant="ghost" size="icon-xs" className="shrink-0" onClick={onClose}>
            <Icon.close className="size-3.5" />
          </Button>
        </Hint>
      </ViewBar>

      <PanelBar className="text-muted-foreground">
        <img src={pull.authorAvatarUrl} alt="" className="size-4 rounded-full" />
        <span>{pull.author}</span>
        <span>
          {pull.headBranch} → {pull.baseBranch}
        </span>
        {pull.fromFork ? <Badge variant="outline">fork</Badge> : null}
        {card ? (
          <span className="ml-auto tabular-nums">
            {t('pull.files', { count: card.changedFiles })}
            {'  '}
            <span className="text-added">+{card.additions}</span>{' '}
            <span className="text-deleted">−{card.deletions}</span>
          </span>
        ) : null}
      </PanelBar>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-3xl space-y-4 px-6 py-4">
          {card === null ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Icon.waiting className="size-3.5 animate-spin" />
              {t('details.loading')}
            </p>
          ) : (
            <>
              {card.labels.length ? (
                <div className="flex flex-wrap gap-1">
                  {card.labels.map((label) => (
                    <Badge key={label} variant="secondary" className="rounded-sm text-2xs">
                      {label}
                    </Badge>
                  ))}
                </div>
              ) : null}

              {card.body ? (
                <Prose text={card.body} />
              ) : (
                <p className="text-muted-foreground text-sm">{t('pull.noDescription')}</p>
              )}

              <Separator />
              <h3 className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <Icon.issue className="size-3.5" />
                {t('pull.comments', { count: card.comments.length })}
              </h3>

              {card.comments.map((comment, i) => (
                <article key={i} className="bg-fill-1 rounded-lg p-3">
                  <header className="text-muted-foreground mb-2 flex items-center gap-2 text-xs">
                    <img src={comment.authorAvatarUrl} alt="" className="size-4 rounded-full" />
                    <span className="text-foreground font-medium">{comment.author}</span>
                    <span>{ago(comment.createdAt)}</span>
                  </header>
                  <Prose text={comment.body} />
                </article>
              ))}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
