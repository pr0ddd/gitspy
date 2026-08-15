import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { identicon } from '@/avatar';
import { hostBotOf } from '@/host';
import type { AvatarCache } from '@/avatarCache';
import { pullAtRefs, type Picked, type Session } from '@/entities/repo';
import type { RowCache } from '@/entities/graph';
import { Icon } from '@/icons';
import * as ipc from '@/ipc';
import { notifyError } from '@/toast';
import { buildCommitFileMenu, type MenuAction } from '@/features/menus';
import { showNativeMenu } from '@/features/menus';
import { FilePath, ListRow, PanelBanner, PanelNote, SectionHeader, StatusBadge } from '@/parts';
import { useCommands } from '@/features/keyboard';
import { rovingTabIndex, stepped } from '@/roving';
import type { ChangedFileView, PullView } from '@/types';

type Props = {
  avatars: AvatarCache | null;
  avatarTick: number;
  session: Session | null;
  rows: RowCache;
  pending: number;
  conflicts: number;
  pulls: PullView[];
  picked: Picked | null;
  diffOpen: boolean;
  onPick: (picked: Picked | null) => void;
  onCopy: (text: string) => void;
  onOpenWorkingTree: () => void;
  onOpenFile: (commit: string, file: ChangedFileView) => void;
  onHistory: (path: string, from: string) => void;
  onOpenPull: (pull: PullView) => void;
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div data-area="files" className="flex min-h-0 flex-1 flex-col">
      {children}
    </div>
  );
}

function Identity({
  avatars,
  name,
  email,
  time,
  verb,
}: {
  avatars: AvatarCache | null;
  name: string;
  email: string;
  time: number;
  verb: 'details.authored' | 'details.committed';
}) {
  const { t, i18n } = useTranslation();
  const bot = hostBotOf(email);
  const Mark = bot ? Icon[bot] : null;
  const when = new Date(time * 1000);
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5" title={email}>
      {Mark ? (
        <span className="bg-fill-1 flex size-9 shrink-0 items-center justify-center rounded-lg">
          <Mark className="size-5" />
        </span>
      ) : (
        <img
          src={avatars?.srcOf(email) ?? identicon(email || name, 36).toDataURL()}
          alt=""
          className="size-9 shrink-0 rounded-lg"
        />
      )}
      <div className="min-w-0">
        <p className="text-foreground truncate text-sm font-semibold">{name}</p>
        <p className="truncate text-xs">
          <span className="text-faint">{t(verb)}</span>{' '}
          <span className="text-muted-foreground tabular-nums">
            {t('details.authoredAt', {
              date: new Intl.DateTimeFormat(i18n.language, {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              }).format(when),
              time: new Intl.DateTimeFormat(i18n.language, {
                hour: '2-digit',
                minute: '2-digit',
              }).format(when),
            })}
          </span>
        </p>
      </div>
    </div>
  );
}

export function Details({
  avatars,
  avatarTick,
  session,
  rows,
  pending,
  conflicts,
  pulls,
  picked,
  diffOpen,
  onPick,
  onCopy,
  onOpenWorkingTree,
  onOpenFile,
  onHistory,
  onOpenPull,
}: Props) {
  const { t } = useTranslation();

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
          void ipc
            .commitFileHunks(repoPath, action.commit, action.path)
            .then(onCopy)
            .catch(notifyError);
      },
    ).catch(notifyError);
  };
  const index = session?.selected ?? 0;
  const row = session ? rows.row(index) : null;
  const hash = row?.kind === 'commit' ? row.hash : null;
  const repo = session?.path ?? null;
  const [loaded, setLoaded] = useState<{ hash: string; files: ChangedFileView[] } | null>(null);

  useEffect(() => {
    if (!repo || !hash) return;
    let cancelled = false;
    ipc
      .commitFiles(repo, hash)
      .then((found) => !cancelled && setLoaded({ hash, files: found }))
      .catch(notifyError);
    return () => {
      cancelled = true;
    };
  }, [repo, hash]);

  const files = loaded?.hash === hash ? loaded.files : null;
  const order = files ?? [];
  const at = order.findIndex((file) => file.path === picked?.path);
  const chosen = useRef<HTMLElement | null>(null);

  useEffect(() => {
    chosen.current?.scrollIntoView({ block: 'nearest' });
  }, [picked?.path]);

  const openAt = (file: ChangedFileView) => {
    if (hash === null) return;
    onPick({ path: file.path, staged: false });
    onOpenFile(hash, file);
  };

  const moveTo = (index: number) => {
    const next = order[index];
    if (!next) return;
    if (diffOpen) openAt(next);
    else onPick({ path: next.path, staged: false });
  };

  const openPicked = () => {
    const file = order[at] ?? order[0];
    if (file) openAt(file);
  };

  useCommands('files', {
    selectNext: () => moveTo(stepped(at, 1, order.length)),
    selectPrevious: () => moveTo(stepped(at, -1, order.length)),
    selectFirst: () => moveTo(0),
    selectLast: () => moveTo(order.length - 1),
    openSelected: openPicked,
  });

  useCommands('app', { openSelected: openPicked });

  if (!session || !row || row.kind !== 'commit') {
    return (
      <Shell>
        <PanelNote>{t('details.loading')}</PanelNote>
      </Shell>
    );
  }

  void avatarTick;
  const foreignCommitter = row.committer !== row.author || row.committerEmail !== row.email;
  const pull = pullAtRefs(session.refsByCommit.get(index) ?? [], pulls);

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
          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground hover:text-foreground -ml-2 text-sm font-normal"
            title={t('details.copyHash')}
            onClick={() => onCopy(row.hash)}
          >
            <Icon.hash className="size-3.5" />
            {row.hash.slice(0, 8)}
          </Button>

          <p className="text-subject text-base leading-snug font-semibold">{row.subject}</p>

          <div className="space-y-2">
            <Identity
              avatars={avatars}
              name={row.author}
              email={row.email}
              time={row.time}
              verb="details.authored"
            />
            {foreignCommitter ? (
              <Identity
                avatars={avatars}
                name={row.committer}
                email={row.committerEmail}
                time={row.committerTime}
                verb="details.committed"
              />
            ) : null}
          </div>

          {pull ? (
            <Button
              variant="outline"
              size="xs"
              className="w-full min-w-0 justify-start"
              title={pull.title}
              onClick={() => onOpenPull(pull)}
            >
              <Icon.pullRequest className="size-3 shrink-0" />
              <span className="text-muted-foreground shrink-0 tabular-nums">#{pull.number}</span>
              <span className="min-w-0 truncate">{pull.title}</span>
            </Button>
          ) : null}

          {row.body ? (
            <p className="text-subject bg-fill-1 max-h-40 overflow-y-auto rounded-md px-3 py-2 text-xs leading-relaxed break-words whitespace-pre-wrap">
              {row.body}
            </p>
          ) : null}
        </div>
      </div>

      <Separator />
      <section className="flex min-h-0 flex-1 flex-col px-3 pt-2 pb-3">
        {files?.length ? (
          <SectionHeader>
            <span>{t('details.changes')}</span>
            <span className="text-faint ml-auto tabular-nums">{files.length}</span>
          </SectionHeader>
        ) : null}

        {files === null ? null : files.length === 0 ? (
          <p className="text-muted-foreground text-xs">{t('details.noChanges')}</p>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div role="listbox" aria-label={t('details.changes')}>
              {files.map((file, index) => (
                <ListRow
                  as="div"
                  key={file.path}
                  hint={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
                  hintSide="left"
                  selected={file.path === picked?.path}
                  tabIndex={rovingTabIndex(at, index)}
                  rowRef={file.path === picked?.path ? chosen : undefined}
                  onClick={() => openAt(file)}
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
              ))}
            </div>
          </div>
        )}
      </section>
    </Shell>
  );
}
