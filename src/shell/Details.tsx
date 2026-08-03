import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { Session } from '../session';
import type { RowCache } from '../rows';
import { GIT } from '../vocabulary';
import { Icon } from '../icons';
import * as ipc from '../ipc';
import { notifyError } from '../toast';
import { FilePath, ListRow, PanelBar, PanelNote } from './parts';
import type { ChangedFileView, RefKind } from '../types';
import { Hint } from '@/components/ui/tooltip';

type Props = {
  session: Session | null;
  rows: RowCache;
  pending: number;
  onCopy: (text: string) => void;
  onOpenWorkingTree: () => void;
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

export function Details({ session, rows, pending, onCopy, onOpenWorkingTree, onOpenFile }: Props) {
  const { t, i18n } = useTranslation();
  const index = session?.selected ?? 0;
  const row = session ? rows.row(index) : null;
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

  if (!session || !row || row.kind !== 'commit') {
    return (
      <Shell>
        <PanelNote>{t('details.loading')}</PanelNote>
      </Shell>
    );
  }

  const when = new Date(row.time * 1000);
  const labels = session.refsByCommit.get(index) ?? [];

  return (
    <Shell>
      {pending > 0 ? (
        <button
          onClick={onOpenWorkingTree}
          className="bg-primary/15 hover:bg-primary/25 border-border flex h-8 shrink-0 items-center gap-2 border-b px-3 text-left transition-colors"
        >
          <span className="text-primary flex-1 truncate text-xs">
            {t('details.pending', { count: pending })}
          </span>
          <span className="text-primary shrink-0 text-xs font-medium">
            {t('details.viewChanges')}
          </span>
        </button>
      ) : null}

      <PanelBar>
        <Icon.commit className="text-muted-foreground size-3.5" />
        <span className="text-muted-foreground tracking-wide uppercase">{GIT.commit}</span>
        <Hint text={t('details.copyHash')}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onCopy(row.hash)}
            className="ml-auto h-6 gap-1.5 font-mono text-xs"
          >
            <Icon.copy className="size-3" />
            {row.hash.slice(0, 8)}
          </Button>
        </Hint>
      </PanelBar>

      <div className="max-h-64 shrink-0 overflow-y-auto">
        <div className="space-y-3 p-3">
          <p className="text-sm leading-snug">{row.subject}</p>

          {row.body ? (
            <pre className="bg-surface text-muted-foreground rounded-md p-2 text-xs leading-relaxed break-words whitespace-pre-wrap">
              {row.body}
            </pre>
          ) : null}

          <dl className="space-y-1">
            <div className="flex gap-3">
              <dt className="text-muted-foreground w-14 shrink-0">{t('details.author')}</dt>
              <dd className="min-w-0 truncate">
                {row.author} <span className="text-muted-foreground">{row.email}</span>
              </dd>
            </div>
            <div className="flex gap-3">
              <dt className="text-muted-foreground w-14 shrink-0">{t('details.date')}</dt>
              <dd>
                {new Intl.DateTimeFormat(i18n.language, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(when)}
              </dd>
            </div>
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
      </div>

      <Separator />
      <section className="flex min-h-0 flex-1 flex-col p-3">
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
          <p className="text-muted-foreground text-xs">{t('details.noChanges')}</p>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ul>
              {files.map((file) => (
                <li key={file.path}>
                  <ListRow
                    mono
                    hint={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
                    onClick={() => onOpenFile(row.hash, file)}
                  >
                    <span className={cn('w-3 shrink-0 text-center', STATUS_STYLE[file.status])}>
                      {file.status}
                    </span>
                    <FilePath path={file.path} />
                    {file.binary ? null : (
                      <span className="ml-auto shrink-0 tabular-nums">
                        <span className="text-added">+{file.added ?? 0}</span>{' '}
                        <span className="text-deleted">−{file.deleted ?? 0}</span>
                      </span>
                    )}
                  </ListRow>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </Shell>
  );
}
