import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { METRICS_AVATARS } from './render';
import { notifyCopied, notifyError, notifyOperation } from './toast';
import * as ipc from './ipc';
import { EMPTY, sessionsReducer } from './session';
import { useRepoData } from './repoData';
import { AvatarCache } from './avatarCache';
import { useCommitSearch } from './search';
import { panelFor } from './panel';
import type {
  AccountView,
  Operation,
  PathOperation,
  PullListView,
  PullView,
  RecentRepo,
  WorkingTreeView,
} from './types';

type Main =
  { kind: 'graph' } | { kind: 'diff'; target: DiffTarget } | { kind: 'pull'; pull: PullView };
import { RepoTabs } from './shell/RepoTabs';
import { Toolbar } from './shell/Toolbar';
import { Sidebar } from './shell/Sidebar';
import { Details } from './shell/Details';
import { GraphView } from './shell/GraphView';
import { StartPage } from './shell/StartPage';
import { DiffView, type DiffTarget } from './shell/DiffView';
import { WorkingTree } from './shell/WorkingTree';
import { Settings } from './shell/Settings';
import { CloneDialog } from './shell/CloneDialog';
import { AskDialog, type Ask } from './shell/AskDialog';
import { PullPanel } from './shell/PullPanel';

export default function App() {
  const { t } = useTranslation();

  const [world, dispatch] = useReducer(sessionsReducer, EMPTY);
  const { sessions, active } = world;
  const [recent, setRecent] = useState<RecentRepo[]>([]);
  const [busy, setBusy] = useState(false);
  const [main, setMain] = useState<Main>({ kind: 'graph' });
  const [pulls, setPulls] = useState<PullListView | null>(null);
  const [tree, setTree] = useState<WorkingTreeView | null>(null);
  const [message, setMessage] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cloning, setCloning] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountView | null>(null);
  const [railed, setRailed] = useState(false);
  const [asking, setAsking] = useState<Ask | null>(null);
  const data = useRepoData();
  const avatarsRef = useRef(new AvatarCache(() => setAvatarTick((n) => n + 1)));
  const [avatarTick, setAvatarTick] = useState(0);
  const { cacheFor, version: redraw } = data;

  const current = sessions.find((s) => s.path === active) ?? null;
  const panel = panelFor(
    current ? cacheFor(current.path).row(current.selected) : undefined,
    current?.repo?.count ?? 0,
  );

  useEffect(() => {
    ipc.recentRepos().then(setRecent).catch(notifyError);
  }, []);

  useEffect(() => {
    ipc.hostAccount('github').then(setAccount).catch(notifyError);

    const connected = ipc.onHostConnected(setAccount);
    const failed = ipc.onHostFailed(notifyError);
    return () => {
      void connected.then((stop) => stop());
      void failed.then((stop) => stop());
    };
  }, []);

  useEffect(() => {
    if (main.kind !== 'graph') setRailed(true);
  }, [main]);

  useEffect(() => {
    if (!active) return;
    ipc
      .avatarPaths(active)
      .then((paths) => avatarsRef.current.refill(paths))
      .catch(() => undefined);

    const stop = ipc.onAvatarsChanged((path) => {
      if (path !== active) return;
      ipc
        .avatarPaths(path)
        .then((paths) => avatarsRef.current.refill(paths))
        .catch(() => undefined);
    });
    return () => {
      void stop.then((off) => off());
    };
  }, [active, redraw]);

  useEffect(() => {
    setMain({ kind: 'graph' });
    setPulls(null);
    if (active) {
      ipc
        .pullRequests(active, false, false)
        .then((known) => known && setPulls(known))
        .catch(() => undefined);
    }
  }, [active]);

  useEffect(() => {
    if (!active) {
      setTree(null);
      return;
    }
    ipc.workingTree(active).then(setTree).catch(notifyError);
  }, [active, redraw]);

  const load = useCallback(
    async (path: string) => {
      try {
        const repo = await ipc.openRepo(path);
        await data.refill(path);
        dispatch({ kind: 'loaded', path, repo });
        void ipc.resolveAvatars(path).catch(() => undefined);

        void ipc.recentRepos().then(setRecent);
        void ipc
          .worktrees(path)
          .then((worktrees) => dispatch({ kind: 'worktrees', path, worktrees }));
      } catch (e) {
        notifyError(e);
        dispatch({ kind: 'failed', path });
      }
    },
    [data],
  );

  const reload = useCallback(
    async (path: string) => {
      try {
        const repo = await ipc.openRepo(path);
        await data.refill(path);
        dispatch({ kind: 'loaded', path, repo });
      } catch (e) {
        notifyError(e);
      }
    },
    [data],
  );

  useEffect(() => {
    const stop = ipc.onRepoChanged((path) => {
      void reload(path);
    });
    return () => {
      void stop.then((off) => off());
    };
  }, [reload]);

  useEffect(() => {
    const stop = ipc.onWorktreeChanged(async (path) => {
      try {
        const tip = await ipc.refreshTip(path);
        if (tip.structureChanged) {
          await reload(path);
        } else {
          await data.refillFirstWindow(path);
        }
        if (path === active) ipc.workingTree(path).then(setTree).catch(notifyError);
      } catch {
        return;
      }
    });
    return () => {
      void stop.then((off) => off());
    };
  }, [active, reload, data]);

  const runOperation = useCallback(
    (operation: Operation) => {
      if (!active) return;
      setBusy(true);
      notifyOperation(operation, 'started');

      ipc
        .runOperation(active, operation, () => {})
        .then(() => {
          notifyOperation(operation, 'finished');
          void ipc.resolveAvatars(active).catch(() => undefined);
          return reload(active);
        })
        .catch(notifyError)
        .finally(() => setBusy(false));
    },
    [active, reload],
  );

  const openPath = useCallback(
    (path: string) => {
      dispatch({ kind: 'open', path });
      void load(path);
    },
    [load],
  );

  const pickRepo = useCallback(async () => {
    const picked = await openDialog({
      directory: true,
      multiple: false,
      title: t('repo.pickTitle'),
    });
    if (typeof picked === 'string') openPath(picked);
  }, [t, openPath]);

  const createRepo = useCallback(async () => {
    const picked = await openDialog({
      directory: true,
      multiple: false,
      title: t('start.createTitle'),
    });
    if (typeof picked !== 'string') return;
    ipc.initRepo(picked).then(openPath).catch(notifyError);
  }, [t, openPath]);

  const closeRepo = useCallback(
    (path: string) => {
      void ipc.closeRepo(path);
      data.drop(path);
      dispatch({ kind: 'close', path });
    },
    [data],
  );

  const forget = useCallback((path: string) => {
    ipc.forgetRepo(path).then(setRecent).catch(notifyError);
  }, []);

  const select = useCallback(
    (index: number) => {
      if (!active) return;
      dispatch({ kind: 'select', path: active, index });
    },
    [active],
  );

  const search = useCommitSearch(active, redraw, select);

  const loadPulls = useCallback(
    (refresh: boolean) => {
      if (!active) return;
      ipc
        .pullRequests(active, refresh, true)
        .then((known) => known && setPulls(known))
        .catch(notifyError);
      void ipc.resolveAvatars(active).catch(() => undefined);
    },
    [active],
  );

  const onNeed = useCallback(
    (chunks: number[]) => {
      if (active) data.fetchChunks(active, chunks);
    },
    [active, data],
  );

  const runPathOperation = useCallback(
    (operation: PathOperation) => {
      if (!active) return;
      setBusy(true);
      ipc
        .stage(active, operation)
        .then(setTree)
        .catch(notifyError)
        .finally(() => setBusy(false));
    },
    [active],
  );

  const commit = useCallback(() => {
    if (!active || !message.trim()) return;
    setBusy(true);
    ipc
      .commit(active, message)
      .then((updated) => {
        setTree(updated);
        setMessage('');
        return reload(active);
      })
      .catch(notifyError)
      .finally(() => setBusy(false));
  }, [active, message, reload]);

  const copy = useCallback((text: string) => {
    void navigator.clipboard.writeText(text);
    notifyCopied(text);
  }, []);

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-full flex-col">
        <RepoTabs
          sessions={sessions}
          active={active}
          onActivate={(path) => dispatch({ kind: 'activate', path })}
          onClose={closeRepo}
          onStart={() => dispatch({ kind: 'activate', path: null })}
          onSettings={() => setSettingsOpen(true)}
        />

        {current === null ? (
          <StartPage
            recent={recent}
            onOpen={pickRepo}
            account={account}
            onOpenPath={openPath}
            onForget={forget}
            onClone={setCloning}
            onCreate={createRepo}
            onConnect={() => setSettingsOpen(true)}
          />
        ) : (
          <>
            <Toolbar
              session={current}
              sessions={sessions}
              tree={tree}
              onRun={runOperation}
              onActivate={(path) => dispatch({ kind: 'activate', path })}
              onAsk={setAsking}
              onTerminal={() => ipc.openTerminal(current.path).catch(notifyError)}
              search={search.query}
              found={search.found}
              at={search.at}
              onSearch={search.setQuery}
              onStep={search.step}
              busy={busy}
            />
            <div className="flex min-h-0 flex-1">
              <Sidebar
                session={current}
                collapsed={railed}
                pulls={pulls}
                onPick={select}
                onToggle={() => setRailed((now) => !now)}
                onPullsExpanded={() => loadPulls(pulls !== null)}
                onPickPull={(pull) => setMain({ kind: 'pull', pull })}
              />
              <main className="flex min-h-0 min-w-0 flex-1 flex-col">
                {main.kind === 'diff' && current.repo ? (
                  <DiffView
                    repo={current.path}
                    target={main.target}
                    onClose={() => setMain({ kind: 'graph' })}
                  />
                ) : main.kind === 'pull' && current.repo ? (
                  <PullPanel
                    repo={current.path}
                    pull={main.pull}
                    busy={busy}
                    onCheckedOut={() => {
                      setMain({ kind: 'graph' });
                      void reload(current.path);
                    }}
                    onClose={() => setMain({ kind: 'graph' })}
                  />
                ) : (
                  <>
                    <GraphView
                      key={current.path}
                      session={current}
                      avatars={avatarsRef.current}
                      rows={cacheFor(current.path)}
                      redraw={redraw + avatarTick}
                      metrics={METRICS_AVATARS}
                      onSelect={select}
                      onNeed={onNeed}
                      message={message}
                      onMessage={setMessage}
                      onCommit={commit}
                    />
                    {current.repo ? (
                      <footer className="bg-card border-border text-muted-foreground shrink-0 border-t px-3 py-1 text-xs">
                        {[
                          t('graph.commits', { count: current.repo.count }),
                          t('graph.lanes', { count: current.repo.maxLane + 1 }),
                          t('stats.read', { ms: current.repo.readMs.toFixed(0) }),
                          t('stats.layout', { ms: current.repo.layoutMs.toFixed(1) }),
                          current.repo.truncated ? t('graph.truncated') : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </footer>
                    ) : null}
                  </>
                )}
              </main>
              <aside className="bg-card border-border flex w-80 shrink-0 flex-col border-l">
                {panel === 'workingTree' ? (
                  tree && tree.entries.length > 0 ? (
                    <WorkingTree
                      tree={tree}
                      busy={busy}
                      onRun={runPathOperation}
                      onOpen={(path, status, staged) =>
                        setMain({
                          kind: 'diff',
                          target: { kind: 'workingTree', path, status, staged },
                        })
                      }
                    />
                  ) : (
                    <p className="text-muted-foreground p-4 text-center">
                      {t('workingTree.clean')}
                    </p>
                  )
                ) : panel === 'noCommits' ? (
                  <p className="text-muted-foreground p-4 text-center">{t('repo.emptyHint')}</p>
                ) : (
                  <Details
                    session={current}
                    rows={cacheFor(current.path)}
                    pending={tree ? tree.staged + tree.unstaged : 0}
                    onCopy={copy}
                    onOpenWorkingTree={() => select(0)}
                    onOpenFile={(commit, file) =>
                      setMain({ kind: 'diff', target: { kind: 'commit', commit, file } })
                    }
                  />
                )}
              </aside>
            </div>
          </>
        )}

        <Settings
          open={settingsOpen}
          account={account}
          onOpenChange={setSettingsOpen}
          onDisconnected={() => setAccount(null)}
        />

        <AskDialog
          ask={asking}
          onOpenChange={(next) => !next && setAsking(null)}
          onRun={runOperation}
        />

        <CloneDialog
          open={cloning !== null}
          url={cloning ?? ''}
          onOpenChange={(next) => !next && setCloning(null)}
          onCloned={openPath}
        />

        <Toaster position="bottom-right" offset={16} />
      </div>
    </TooltipProvider>
  );
}
