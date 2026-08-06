import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { Session } from '@/entities/repo';
import type { RowCache } from '@/entities/graph';
import { GIT } from '@/vocabulary';
import { Icon } from '@/icons';
import * as ipc from '@/ipc';
import { notifyError } from '@/toast';
import { buildCommitFileMenu, type MenuAction } from '@/features/menus';
import { showNativeMenu } from '@/features/menus';
import { FilePath, ListRow, PanelBanner, PanelBar, PanelNote } from '@/parts';
import type { ChangedFileView, RefKind } from '@/types';
import { Hint } from '@/components/ui/tooltip';

type Props = {
  session: Session | null;
  rows: RowCache;
  pending: number;
  conflicts: number;
  onCopy: (text: string) => void;
  onOpenWorkingTree: () => void;
  onOpenFile: (commit: string, file: ChangedFileView) => void;
  onHistory: (path: string, from: string) => void;
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

const REF_ICON: Record<RefKind, keyof typeof Icon> = {
  localBranch: 'branch',
  remoteBranch: 'remote',
  tag: 'tag',
  stash: 'stash',
};

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col">{children}</div>;
}

export function Details({
  session,
  rows,
  pending,
  conflicts,
  onCopy,
  onOpenWorkingTree,
  onOpenFile,
  onHistory,
}: Props) {
  const { t, i18n } = useTranslation();

  const openFileMenu = (commit: string, file: ChangedFileView) => {
    const repoPath = session?.path;
    if (!repoPath) return;
    showNativeMenu(
      buildCommitFileMenu(commit, file.path),
      (key, params) => t(key as 'menu.copyPath', params),
      (action: MenuAction) => {
        if (action.kind === 'copy') onCopy(action.text);
        else if (action.kind === 'history') onHistory(action.path, commit);
        else if (action.kind === 'openFile')
          void ipc.openPath(repoPath, action.path).catch(notifyError);
        else if (action.kind === 'reveal')
          void ipc.revealPath(repoPath, action.path).catch(notifyError);
        else if (action.kind === 'copyCommitPatch')
          void ipc.commitFileHunks(repoPath, action.commit, action.path).then(onCopy).catch(notifyError);
      },
    ).catch(notifyError);
  };
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
      {conflicts > 0 ? (
        <PanelBanner
          tone="conflict"
          label={t('conflict.inWorkingDirectory', { count: conflicts })}
          action={t('conflict.view')}
          onClick={onOpenWorkingTree}
        />
      ) : pending > 0 ? (
        <PanelBanner
          label={t('details.pending', { count: pending })}
          action={t('details.viewChanges')}
          onClick={onOpenWorkingTree}
        />
      ) : null}

      <PanelBar className="border-t-0">
        <Icon.commit className="text-muted-foreground size-3.5" />
        <span className="text-muted-foreground">{GIT.commit}</span>
        <Hint text={t('details.copyHash')}>
          <Button
            variant="secondary"
            size="2xs"
            onClick={() => onCopy(row.hash)}
            className="ml-auto font-mono"
          >
            <Icon.copy className="size-3" />
            {row.hash.slice(0, 8)}
          </Button>
        </Hint>
      </PanelBar>

      <div className="shrink-0">
        <div className="space-y-4 px-5 pt-2 pb-5">
          <p className="text-base leading-snug">{row.subject}</p>

          {row.body ? (
            <pre className="text-faint max-h-28 overflow-y-auto font-mono text-2xs leading-loose break-words whitespace-pre-wrap">
              {row.body}
            </pre>
          ) : null}

          <dl className="space-y-1.5 text-xs">
            <div className="flex gap-3.5">
              <dt className="text-faint w-14 shrink-0">{t('details.author')}</dt>
              <dd className="min-w-0 truncate">
                {row.author} <span className="text-faint">{row.email}</span>
              </dd>
            </div>
            <div className="flex gap-3.5">
              <dt className="text-faint w-14 shrink-0">{t('details.date')}</dt>
              <dd className="tabular-nums">
                {new Intl.DateTimeFormat(i18n.language, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(when)}
              </dd>
            </div>
          </dl>

          {labels.length ? (
            <div className="flex flex-wrap gap-2">
              {labels.map((ref) => {
                const Glyph = Icon[REF_ICON[ref.kind]];
                return (
                  <Badge
                    key={`${ref.kind}:${ref.name}`}
                    title={ref.name}
                    className={cn(
                      'text-2xs max-w-full gap-1.5 rounded-md px-2 py-1',
                      ref.isHead
                        ? 'bg-primary/25 text-foreground'
                        : 'bg-fill-2 text-muted-foreground',
                    )}
                  >
                    <Glyph className="size-3 shrink-0" />
                    <span className="min-w-0 truncate">{ref.name}</span>
                  </Badge>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      <Separator />
      <section className="flex min-h-0 flex-1 flex-col px-3 pt-4 pb-3">
        {files.length ? (
          <div className="flex items-center gap-4 px-2 pb-3 text-xs">
            {(
              [
                ['details.modified', countOf(files, ['M', 'T']), 'text-modified'],
                ['details.added', countOf(files, ['A', 'C']), 'text-added'],
                ['details.deleted', countOf(files, ['D']), 'text-deleted'],
              ] as const
            ).map(([key, count, colour]) =>
              count === 0 ? null : (
                <span key={key} className={cn('tabular-nums', colour)}>
                  {t(key, { count })}
                </span>
              ),
            )}
          </div>
        ) : null}

        {files.length === 0 ? (
          <p className="text-muted-foreground text-xs">{t('details.noChanges')}</p>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ul>
              {files.map((file) => (
                <li key={file.path}>
                  <ListRow
                    title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
                    onClick={() => onOpenFile(row.hash, file)}
                    onContextMenu={() => openFileMenu(row.hash, file)}
                  >
                    <span className={cn('w-3 shrink-0 text-center', STATUS_STYLE[file.status])}>
                      {file.status}
                    </span>
                    <FilePath path={file.path} />
                    {file.binary ? null : (
                      <span className="text-2xs ml-auto shrink-0 tabular-nums">
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
