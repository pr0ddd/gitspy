import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Separator } from '@/components/ui/separator';
import { identicon } from '@/avatar';
import type { AvatarCache } from '@/avatarCache';
import type { Session } from '@/entities/repo';
import type { RowCache } from '@/entities/graph';
import { Icon } from '@/icons';
import * as ipc from '@/ipc';
import { notifyError } from '@/toast';
import { buildCommitFileMenu, type MenuAction } from '@/features/menus';
import { showNativeMenu } from '@/features/menus';
import {
  Chip,
  FilePath,
  ListRow,
  PanelBanner,
  PanelNote,
  SectionHeader,
  StatusBadge,
} from '@/parts';
import type { ChangedFileView, RefKind } from '@/types';

type Props = {
  avatars: AvatarCache | null;
  avatarTick: number;
  session: Session | null;
  rows: RowCache;
  pending: number;
  conflicts: number;
  onCopy: (text: string) => void;
  onOpenWorkingTree: () => void;
  onOpenFile: (commit: string, file: ChangedFileView) => void;
  onHistory: (path: string, from: string) => void;
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
  avatars,
  avatarTick,
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

  void avatarTick;
  const authorPortrait =
    avatars?.srcOf(row.email) ?? identicon(row.email || row.author, 28).toDataURL();
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

      <div className="shrink-0">
        <div className="space-y-3 px-5 pt-4 pb-5">
          <p className="text-subject text-base leading-snug font-semibold">{row.subject}</p>

          <div className="flex flex-wrap gap-1.5">
            <Chip title={row.email}>
              <img src={authorPortrait} alt="" className="size-3.5 shrink-0 rounded-full" />
              {row.author}
            </Chip>
            <Chip>
              <Icon.clock className="size-3 shrink-0 opacity-70" />
              <span className="tabular-nums">
                {new Intl.DateTimeFormat(i18n.language, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(when)}
              </span>
            </Chip>
            <Chip title={t('details.copyHash')} onClick={() => onCopy(row.hash)}>
              <Icon.hash className="size-3 shrink-0 opacity-70" />
              <span className="font-mono">{row.hash.slice(0, 8)}</span>
              <Icon.copy className="size-2.5 opacity-60" />
            </Chip>
            {labels.map((ref) => {
              const Glyph = Icon[REF_ICON[ref.kind]];
              return (
                <Chip key={`${ref.kind}:${ref.name}`} title={ref.name} head={ref.isHead}>
                  <Glyph className="size-3 shrink-0" />
                  <span className="min-w-0 truncate">{ref.name}</span>
                </Chip>
              );
            })}
          </div>

          {row.body ? (
            <p className="text-subject max-h-40 overflow-y-auto text-xs leading-relaxed break-words whitespace-pre-wrap">
              {row.body}
            </p>
          ) : null}
        </div>
      </div>

      <Separator />
      <section className="flex min-h-0 flex-1 flex-col px-3 pt-2 pb-3">
        {files.length ? (
          <SectionHeader>
            <span>{t('details.changes')}</span>
            <span className="text-faint ml-auto tabular-nums">{files.length}</span>
          </SectionHeader>
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
                    <StatusBadge letter={file.status} />
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
