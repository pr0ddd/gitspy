import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { Session } from '../session';
import type { RowCache } from '../rows';
import { GIT } from '../vocabulary';
import { Icon } from '../icons';
import * as ipc from '../ipc';
import { shortenDirectory, splitPath } from '../paths';
import { notifyError } from '../toast';
import type { ChangedFileView, RefKind } from '../types';

type Props = {
  session: Session | null;
  rows: RowCache;
  onCopy: (text: string) => void;
  onOpenFile: (commit: string, file: ChangedFileView) => void;
};

const countOf = (files: ChangedFileView[], statuses: string[]): number =>
  files.filter((file) => statuses.includes(file.status)).length;

const STATUS_STYLE: Record<string, string> = {
  A: 'text-added',
  M: 'text-modified',
  D: 'text-deleted',
  R: 'text-renamed',
  C: 'text-renamed',
  T: 'text-modified',
  U: 'text-conflict',
};

const REF_STYLE: Record<RefKind, string> = {
  localBranch: 'bg-ref-local text-white',
  remoteBranch: 'bg-ref-remote text-white',
  tag: 'bg-ref-tag text-white',
  stash: 'bg-ref-stash text-white',
};

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col">{children}</div>;
}

export function Details({ session, rows, onCopy, onOpenFile }: Props) {
  const { t, i18n } = useTranslation();
  const index = session?.selected ?? null;
  const row = index === null ? null : rows.row(index);
  const hash = row?.kind === 'commit' ? row.hash : null;
  const repo = session?.path ?? null;
  const [files, setFiles] = useState<ChangedFileView[]>([]);

  useEffect(() => {
    if (!repo || !hash) {
      setFiles([]);
      return;
    }
    let cancelled = false;
    ipc
      .commitFiles(repo, hash)
      .then((found) => !cancelled && setFiles(found))
      .catch(notifyError);
    return () => {
      cancelled = true;
    };
  }, [repo, hash]);

  if (!session || index === null) {
    return (
      <Shell>
        <p className="text-muted-foreground p-4 text-center">{t('details.pickCommit')}</p>
      </Shell>
    );
  }

  if (!row || row.kind !== 'commit') {
    return (
      <Shell>
        <p className="text-muted-foreground p-4 text-center">{t('details.loading')}</p>
      </Shell>
    );
  }

  const when = new Date(row.time * 1000);
  const labels = session.refsByCommit.get(index) ?? [];

  return (
    <Shell>
      <header className="border-border flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <Icon.commit className="text-muted-foreground size-3.5" />
        <span className="text-muted-foreground text-xs tracking-wide uppercase">
          {GIT.commit}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onCopy(row.hash)}
          title={t('details.copyHash')}
          className="ml-auto h-6 gap-1.5 font-mono text-xs"
        >
          <Icon.copy className="size-3" />
          {row.hash.slice(0, 8)}
        </Button>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-3">
          <p className="text-sm leading-snug">{row.subject}</p>

          {row.body ? (
            <pre className="bg-surface text-muted-foreground rounded-md p-2 text-xs leading-relaxed break-words whitespace-pre-wrap">
              {row.body}
            </pre>
          ) : null}

          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">{t('details.author')}</dt>
            <dd className="truncate">
              {row.author} <span className="text-muted-foreground">{row.email}</span>
            </dd>
            <dt className="text-muted-foreground">{t('details.date')}</dt>
            <dd>
              {new Intl.DateTimeFormat(i18n.language, {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(when)}
            </dd>
          </dl>

          {labels.length ? (
            <div className="flex flex-wrap gap-1">
              {labels.map((ref) => (
                <Badge
                  key={`${ref.kind}:${ref.name}`}
                  className={cn('rounded-sm px-1.5 py-0 text-2xs', REF_STYLE[ref.kind])}
                >
                  {ref.name}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      </ScrollArea>

      <Separator />
      <section className="flex min-h-0 shrink-0 basis-1/2 flex-col p-3">
        <div className="mb-1.5 flex items-center gap-3 text-xs">
          <span className="text-modified tabular-nums">
            {t('details.modified', { count: countOf(files, ['M', 'T']) })}
          </span>
          <span className="text-added tabular-nums">
            {t('details.added', { count: countOf(files, ['A', 'C']) })}
          </span>
          <span className="text-deleted tabular-nums">
            {t('details.deleted', { count: countOf(files, ['D']) })}
          </span>
        </div>

        {files.length === 0 ? (
          <p className="text-muted-foreground/70">{t('details.noChanges')}</p>
        ) : (
          <ScrollArea className="min-h-0 flex-1">
            <ul className="space-y-0.5 font-mono text-xs">
              {files.map((file) => (
                <li key={file.path}>
                  <button
                    onClick={() => onOpenFile(row.hash, file)}
                    title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
                    className="hover:bg-surface-hover flex h-6 w-full items-baseline gap-1.5 rounded-sm px-1 text-left"
                  >
                    <span className={cn('w-3 shrink-0 text-center', STATUS_STYLE[file.status])}>
                      {file.status}
                    </span>
                    <span className="text-muted-foreground shrink-0">
                      {shortenDirectory(splitPath(file.path).directory, 18)}
                    </span>
                    <span className="truncate">{splitPath(file.path).name}</span>
                    {file.binary ? null : (
                      <span className="ml-auto shrink-0 tabular-nums">
                        <span className="text-added">+{file.added ?? 0}</span>{' '}
                        <span className="text-deleted">−{file.deleted ?? 0}</span>
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </section>
    </Shell>
  );
}
