import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Icon } from '../icons';
import * as ipc from '../ipc';
import { notifyError } from '../toast';
import type { PullCardView, PullView } from '../types';
import { Hint } from '@/components/ui/tooltip';

type Props = {
  repo: string;
  pull: PullView;
  busy: boolean;
  onCheckedOut: () => void;
  onClose: () => void;
};

function Body({ text }: { text: string }) {
  return (
    <div className="[&_a]:text-primary space-y-3 text-sm leading-relaxed [&_code]:rounded-sm [&_code]:bg-surface-raised [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs [&_details]:rounded-md [&_details]:border [&_details]:border-border [&_details]:p-2 [&_h1]:mt-4 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-medium [&_hr]:border-border [&_img]:max-w-full [&_li]:ml-4 [&_ol]:list-decimal [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-surface-raised [&_pre]:p-2 [&_summary]:cursor-pointer [&_summary]:text-muted-foreground [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-0.5 [&_td]:whitespace-nowrap [&_th]:border [&_th]:border-border [&_th]:bg-surface-raised [&_th]:px-2 [&_th]:py-0.5 [&_th]:font-medium [&_th]:whitespace-nowrap [&_ul]:list-disc">
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSanitize]}>
        {text}
      </Markdown>
    </div>
  );
}

export function PullPanel({ repo, pull, busy, onCheckedOut, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const [card, setCard] = useState<PullCardView | null>(null);
  const [switching, setSwitching] = useState(false);

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
    setSwitching(true);
    ipc
      .checkoutPull(repo, pull.number, pull.headBranch, pull.fromFork)
      .then(onCheckedOut)
      .catch(notifyError)
      .finally(() => setSwitching(false));
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
    <div className="bg-surface flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="bg-card border-border flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <Icon.pullRequest className="text-muted-foreground size-3.5 shrink-0" />
        <span className="text-muted-foreground shrink-0 font-mono text-xs">#{pull.number}</span>
        <span className="truncate text-sm font-medium">{pull.title}</span>
        <Badge className="bg-added shrink-0 rounded-sm px-1.5 py-0 text-2xs text-white">
          {pull.draft ? t('pull.draft') : t('pull.open')}
        </Badge>

        <Button
          size="sm"
          disabled={busy || switching}
          onClick={checkout}
          className="ml-auto h-6 shrink-0 gap-1.5 text-xs"
        >
          <Icon.branch className="size-3" />
          {t('pull.checkout')}
        </Button>
        <Hint text={t('diff.close')}>
          <Button variant="ghost" size="icon" className="size-6 shrink-0" onClick={onClose}>
            <Icon.close className="size-3.5" />
          </Button>
        </Hint>
      </header>

      <div className="border-border text-muted-foreground flex h-8 shrink-0 items-center gap-2 border-b px-3 text-xs">
        <img src={pull.authorAvatarUrl} alt="" className="size-4 rounded-full" />
        <span>{pull.author}</span>
        <span className="font-mono">
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
      </div>

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
                <Body text={card.body} />
              ) : (
                <p className="text-muted-foreground/70 text-sm">{t('pull.noDescription')}</p>
              )}

              <Separator />
              <h3 className="text-muted-foreground flex items-center gap-1.5 text-xs tracking-wide uppercase">
                <Icon.issue className="size-3.5" />
                {t('pull.comments', { count: card.comments.length })}
              </h3>

              {card.comments.map((comment, i) => (
                <article key={i} className="bg-card border-border rounded-md border p-3">
                  <header className="text-muted-foreground mb-2 flex items-center gap-2 text-xs">
                    <img src={comment.authorAvatarUrl} alt="" className="size-4 rounded-full" />
                    <span className="text-foreground font-medium">{comment.author}</span>
                    <span>{ago(comment.createdAt)}</span>
                  </header>
                  <Body text={comment.body} />
                </article>
              ))}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
