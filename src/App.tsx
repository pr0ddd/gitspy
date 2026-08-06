import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { METRICS_AVATARS, METRICS_COMPACT } from './render';
import { notifyCopied, notifyError, notifyOperation, notifyOperationFailed } from './toast';
import * as ipc from './ipc';
import { readPref, usePref, writePref } from './prefs';
import { EMPTY, sessionsReducer } from './session';
import { useRepoData } from './repoData';
import { AvatarCache } from './avatarCache';
import { useCommitSearch } from './search';
import { panelFor } from './panel';
import { restartToUpdate, useReadyUpdate } from './updater';
import { useSessionActions } from './sessionActions';
import { clampPanel, PANEL_LIMITS } from './resize';
import { useZoom } from './zoom';
import { BottomBar } from './shell/BottomBar';
import { ResizeGrip } from './shell/parts';
import type {
  AccountView,
  Operation,
  PathOperation,
  PullListView,
  PullView,
  RecentRepo,
  RefView,
  RemoteView,
  WorkingTreeView,
} from './types';

type Main =
  | { kind: 'graph' }
  | { kind: 'diff'; target: DiffTarget }
  | { kind: 'conflict'; path: string }
  | { kind: 'history'; path: string; from?: string }
  | { kind: 'pull'; pull: PullView };
import { RepoTabs } from './shell/RepoTabs';
import { Toolbar } from './shell/Toolbar';
import { ConfirmBar } from './shell/ConfirmBar';
import { Sidebar } from './shell/Sidebar';
import { Details } from './shell/Details';
import { GraphView } from './shell/GraphView';
import { StartPage } from './shell/StartPage';
import { DiffView, type DiffTarget } from './shell/DiffView';
import { ConflictView } from './shell/ConflictView';
import { FileHistoryView } from './shell/FileHistoryView';
import { WorkingTree } from './shell/WorkingTree';
import { Settings } from './shell/Settings';
import { CloneDialog } from './shell/CloneDialog';
import { AskBar, type Ask } from './shell/AskBar';
import { PullPanel } from './shell/PullPanel';
import { PanelNote } from './shell/parts';
import { remoteAvatarKey } from './chips';
import { composeCommitMessage } from './commitMessage';
import { viewForEntry } from './conflict';

export default function App() {
  const { t } = useTranslation();

  const [world, dispatch] = useReducer(sessionsReducer, EMPTY);
  const { sessions, active } = world;
  const [recent, setRecent] = useState<RecentRepo[]>([]);
  const [running, setRunning] = useState<{ kind: string; target?: string } | null>(null);
  const busy = running !== null;
  const checkingOut = running?.kind === 'checkout' ? (running.target ?? null) : null;

  const busyWhile = useCallback(
    async (marker: { kind: string; target?: string }, work: () => Promise<unknown>) => {
      setRunning(marker);
      try {
        await work();
      } finally {
        setRunning(null);
      }
    },
    [],
  );
  const [main, setMain] = useState<Main>({ kind: 'graph' });
  const [pulls, setPulls] = useState<PullListView | null>(null);
  const [tree, setTree] = useState<WorkingTreeView | null>(null);
  const [confirming, setConfirming] = useState<Operation | null>(null);
  const adoptTree = useCallback((next: WorkingTreeView) => {
    setTree((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, []);
  const [message, setMessage] = useState('');
  const [description, setDescription] = useState('');
  const [amend, setAmend] = useState(false);
  const [settings, setSettings] = useState<'closed' | 'open' | 'active'>('closed');
  const [cloning, setCloning] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountView | null>(null);
  const [railed, setRailed] = useState(() => readPref('sidebar.collapsed', false));
  const [panelWidth, setPanelWidth] = usePref<number>('details.width', PANEL_LIMITS.details.fallback);
  const panelDragFrom = useRef(panelWidth);
  const readyUpdate = useReadyUpdate();
  const { zoom, setZoom } = useZoom();
  const toggleRail = useCallback(() => {
    setRailed((now) => {
      const next = !now;
      writePref('sidebar.collapsed', next);
      return next;
    });
  }, []);
  const [asking, setAsking] = useState<Ask | null>(null);
  const [compact, setCompact] = usePref('graph.compact', false);
  const data = useRepoData();
  const avatarsRef = useRef(new AvatarCache(() => setAvatarTick((n) => n + 1)));
  const [avatarTick, setAvatarTick] = useState(0);
  const { cacheFor, refill, refillFirstWindow, fetchChunks, drop, version: redraw } = data;

  const current = sessions.find((s) => s.path === active) ?? null;
  const headRow = current ? cacheFor(current.path).row(1) : null;
  const previousCommit =
    headRow?.kind === 'commit' ? { subject: headRow.subject, body: headRow.body } : null;
  const pullHeads = useMemo(
    () =>
      new Set((pulls?.pulls ?? []).filter((p) => !p.fromFork).map((p) => p.headBranch)),
    [pulls],
  );
  const panel = panelFor(
    current ? cacheFor(current.path).row(current.selected) : undefined,
    current?.repo?.count ?? 0,
  );

  useEffect(() => {
    ipc.recentRepos().then(setRecent).catch(notifyError);
  }, []);

  useEffect(() => {
    const toggleSidebar = (e: KeyboardEvent) => {
      if (e.key !== '\\' || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      toggleRail();
    };
    window.addEventListener('keydown', toggleSidebar);
    return () => window.removeEventListener('keydown', toggleSidebar);
  }, [toggleRail]);

  useEffect(() => {
    const suppressWebviewMenu = (e: MouseEvent) => {
      const editable = (e.target as HTMLElement | null)?.closest(
        'input, textarea, [contenteditable]',
      );
      if (!editable) e.preventDefault();
    };
    document.addEventListener('contextmenu', suppressWebviewMenu);
    return () => document.removeEventListener('contextmenu', suppressWebviewMenu);
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

  const remotes = current?.repo?.remotes;
  useEffect(() => {
    if (!remotes) return;
    const urls = Object.fromEntries(
      remotes
        .filter((r) => r.avatarUrl)
        .map((r) => [remoteAvatarKey(r.avatarUrl as string), r.avatarUrl as string]),
    );
    avatarsRef.current.refillRemote(urls);
  }, [remotes]);

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
    setAmend(false);
    if (!active) return;

    let alive = true;
    const stale = (view: PullListView) => Date.now() / 1000 - view.fetchedAt > 300;
    ipc
      .pullRequests(active, false, true)
      .then((known) => {
        if (!alive || !known) return;
        setPulls(known);
        if (!stale(known)) return;
        return ipc.pullRequests(active, true, true).then((fresh) => {
          if (alive && fresh) setPulls(fresh);
        });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [active]);

  useEffect(() => {
    if (!active) {
      setTree(null);
      return;
    }
    ipc.workingTree(active).then(adoptTree).catch(notifyError);
  }, [active]);

  const mergeSubject = tree?.merging?.subject ?? null;
  useEffect(() => {
    if (mergeSubject) setMessage((now) => (now.trim() ? now : mergeSubject));
  }, [mergeSubject]);

  const warmAvatars = useCallback(async (path: string, remotes: RemoteView[]) => {
    const urls = Object.fromEntries(
      remotes
        .filter((r) => r.avatarUrl)
        .map((r) => [remoteAvatarKey(r.avatarUrl as string), r.avatarUrl as string]),
    );
    const warmed = Promise.all([
      ipc
        .avatarPaths(path)
        .then((paths) => avatarsRef.current.refill(paths))
        .catch(() => undefined),
      avatarsRef.current.refillRemote(urls),
    ]);
    await Promise.race([warmed, new Promise((idle) => window.setTimeout(idle, 400))]);
  }, []);

  const load = useCallback(
    async (path: string) => {
      try {
        const repo = await ipc.openRepo(path);
        await refill(path);
        await warmAvatars(path, repo.remotes);
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
    [refill, warmAvatars],
  );

  const activeRef = useRef(active);
  activeRef.current = active;

  const reloading = useRef(new Map<string, Promise<void>>());
  const reload = useCallback(
    (path: string) => {
      const inFlight = reloading.current.get(path);
      if (inFlight) return inFlight;

      const run = (async () => {
        try {
          const repo = await ipc.openRepo(path);
          await refill(path);
          await warmAvatars(path, repo.remotes);
          dispatch({ kind: 'loaded', path, repo });
          if (activeRef.current === path) {
            void ipc.workingTree(path).then(adoptTree).catch(notifyError);
          }
          void ipc
            .worktrees(path)
            .then((worktrees) => dispatch({ kind: 'worktrees', path, worktrees }))
            .catch(() => undefined);
        } catch (e) {
          notifyError(e);
        } finally {
          reloading.current.delete(path);
        }
      })();
      reloading.current.set(path, run);
      return run;
    },
    [refill, warmAvatars],
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
          await refillFirstWindow(path);
        }
        if (path === active) ipc.workingTree(path).then(adoptTree).catch(notifyError);
      } catch {
        return;
      }
    });
    return () => {
      void stop.then((off) => off());
    };
  }, [active, reload, refillFirstWindow]);

  const runOperation = useCallback(
    (operation: Operation) => {
      if (!active) return;
      void busyWhile({ kind: operation.kind }, async () => {
        try {
          await ipc.runOperation(active, operation, () => {});
        } catch (e) {
          notifyOperationFailed(operation, e);
          return;
        }
        notifyOperation(operation);
        void ipc.resolveAvatars(active).catch(() => undefined);
        await reload(active).catch(notifyError);
      });
    },
    [active, reload, busyWhile],
  );



  const checkoutRef = useCallback(
    (ref: RefView) => {
      if (!active) return;
      void busyWhile({ kind: 'checkout', target: ref.name }, () =>
        ipc
          .checkoutRef(active, ref.name, ref.kind)
          .then(() => reload(active))
          .catch(notifyError),
      );
    },
    [active, reload, busyWhile],
  );


  const { openPath, pickRepo, createRepo, closeRepo, forget } = useSessionActions({
    sessions,
    active,
    dispatch,
    load,
    drop,
    setRecent,
  });

  const select = useCallback(
    (index: number) => {
      if (!active) return;
      dispatch({ kind: 'select', path: active, index });
    },
    [active],
  );

  const revealCommit = useCallback(
    (index: number) => {
      select(index);
      setMain({ kind: 'graph' });
    },
    [select],
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
      if (active) fetchChunks(active, chunks);
    },
    [active, fetchChunks],
  );

  const runPathOperation = useCallback(
    (operation: PathOperation) => {
      if (!active) return;
      ipc.stage(active, operation).then(adoptTree).catch(notifyError);
    },
    [active],
  );

  const commit = useCallback(() => {
    if (!active || !message.trim()) return;
    void busyWhile({ kind: 'commit' }, () =>
      ipc
        .commit(active, composeCommitMessage(message, description), amend)
        .then((updated) => {
          setTree(updated);
          setMessage('');
          setDescription('');
          setAmend(false);
          return reload(active);
        })
        .catch(notifyError),
    );
  }, [active, message, description, amend, reload, busyWhile]);

  const copy = useCallback((text: string) => {
    void navigator.clipboard.writeText(text);
    notifyCopied(text);
  }, []);

  const openUrl = useCallback((url: string) => {
    ipc.openUrl(url).catch(notifyError);
  }, []);

  const addWorktree = useCallback(
    async (at: string) => {
      if (!active) return;
      const picked = await openDialog({
        directory: true,
        multiple: false,
        title: t('worktree.pickTitle'),
      });
      if (typeof picked !== 'string') return;
      runOperation({
        kind: 'worktreeAdd',
        path: `${picked}/${at.replaceAll('/', '-')}`,
        at,
      });
    },
    [active, runOperation],
  );

  return (
    <TooltipProvider delayDuration={600} skipDelayDuration={0}>
      <div className="flex h-full flex-col">
        <RepoTabs
          sessions={sessions}
          active={settings === 'active' ? '' : active}
          settings={settings}
          onActivate={(path) => {
            setSettings((now) => (now === 'closed' ? now : 'open'));
            dispatch({ kind: 'activate', path });
          }}
          onClose={closeRepo}
          onStart={() => {
            setSettings((now) => (now === 'closed' ? now : 'open'));
            dispatch({ kind: 'activate', path: null });
          }}
          onSettings={() => setSettings('active')}
          onCloseSettings={() => setSettings('closed')}
        />

        {current === null || settings === 'active' ? null : confirming ? (
          <ConfirmBar
            operation={confirming}
            onConfirm={(operation) => {
              setConfirming(null);
              runOperation(operation);
            }}
            onCancel={() => setConfirming(null)}
          />
        ) : (
          <Toolbar
            tree={tree}
            onRun={runOperation}
            onAsk={(kind) => setAsking({ kind })}
            onTerminal={() => ipc.openTerminal(current.path).catch(notifyError)}
            search={search.query}
            found={search.found}
            at={search.at}
            onSearch={search.setQuery}
            onStep={search.step}
            busy={busy}
            running={running?.kind ?? null}
          />
        )}

        <div
          className={cn(
            'flex min-h-0 flex-1 pr-2',
            (current === null || settings === 'active') && 'pb-2',
          )}
        >
        {settings === 'active' ? (
          <Settings open account={account} onDisconnected={() => setAccount(null)} />
        ) : current === null ? (
          <StartPage
            recent={recent}
            onOpen={pickRepo}
            account={account}
            onOpenPath={openPath}
            onForget={forget}
            onClone={setCloning}
            onCreate={createRepo}
            onConnect={() => setSettings('active')}
          />
        ) : (
          <>
              <Sidebar
                collapsed={railed}
                onToggle={toggleRail}
                session={current}
                pulls={pulls}
                currentBranch={tree?.branch ?? null}
                checkingOut={checkingOut}
                onPick={revealCommit}
                onCheckout={checkoutRef}
                onRun={runOperation}
                onCopy={copy}
                onAsk={setAsking}
                onWorktree={addWorktree}
                onOpenUrl={openUrl}
                onPullsExpanded={() => loadPulls(pulls !== null)}
                onPickPull={(pull) => setMain({ kind: 'pull', pull })}
              />
              <div className="flex min-w-0 flex-1 flex-col">
              <div className="bg-card shadow-sheet relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border">
              <AskBar
                ask={asking}
                onOpenChange={(next) => !next && setAsking(null)}
                onRun={runOperation}
              />
              <div className="flex min-h-0 flex-1">
              <main className="flex min-h-0 min-w-0 flex-1 flex-col">
                {main.kind === 'diff' && current.repo ? (
                  <DiffView
                    repo={current.path}
                    target={main.target}
                    onClose={() => setMain({ kind: 'graph' })}
                    onTree={adoptTree}
                    onRun={runPathOperation}
                    onTarget={(target) => setMain({ kind: 'diff', target })}
                    onHistory={(path, from) => setMain({ kind: 'history', path, from })}
                  />
                ) : main.kind === 'history' && current.repo ? (
                  <FileHistoryView
                    repo={current.path}
                    path={main.path}
                    from={main.from ?? null}
                    avatars={avatarsRef.current}
                    onClose={() => setMain({ kind: 'graph' })}
                  />
                ) : main.kind === 'conflict' && current.repo ? (
                  <ConflictView
                    repo={current.path}
                    path={main.path}
                    from={tree?.merging?.from ?? null}
                    into={tree?.branch ?? null}
                    onClose={() => setMain({ kind: 'graph' })}
                    onResolved={(next) => {
                      adoptTree(next);
                      setMain({ kind: 'graph' });
                    }}
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
                  <GraphView
                    key={current.path}
                    session={current}
                    avatars={avatarsRef.current}
                    rows={cacheFor(current.path)}
                    redraw={redraw + avatarTick}
                    metrics={compact ? METRICS_COMPACT : METRICS_AVATARS}
                    pullHeads={pullHeads}
                    currentBranch={tree?.branch ?? null}
                    onSelect={select}
                    onCheckoutRef={checkoutRef}
                    onRun={runOperation}
                    onCopy={copy}
                    onAsk={setAsking}
                    onWorktree={addWorktree}
                    onOpenUrl={openUrl}
                    onNeed={onNeed}
                    message={message}
                    onMessage={setMessage}
                    onCommit={commit}
                    compact={compact}
                    onCompact={setCompact}
                  />
                )}
              </main>
              <aside
                className="relative flex shrink-0 flex-col border-l"
                style={{ width: clampPanel('details', panelWidth) }}
              >
                <ResizeGrip
                  edge="left"
                  onStart={() => {
                    panelDragFrom.current = clampPanel('details', panelWidth);
                  }}
                  onMove={(dx) => setPanelWidth(clampPanel('details', panelDragFrom.current - dx))}
                  onEnd={() => {}}
                />
                {panel === 'workingTree' ? (
                  tree && tree.entries.length > 0 ? (
                    <WorkingTree
                      repo={current.path}
                      tree={tree}
                      busy={busy}
                      committing={running?.kind === 'commit'}
                      message={message}
                      description={description}
                      amend={amend}
                      previous={previousCommit}
                      onMessage={setMessage}
                      onDescription={setDescription}
                      onAmend={setAmend}
                      onCommit={commit}
                      onRun={runPathOperation}
                      onOperation={runOperation}
                      onConfirm={setConfirming}
                      onCopy={copy}
                      onHistory={(path) => setMain({ kind: 'history', path })}
                      onOpen={(path, status, staged) =>
                        setMain(
                          viewForEntry(status, staged) === 'conflict'
                            ? { kind: 'conflict', path }
                            : { kind: 'diff', target: { kind: 'workingTree', path, status, staged } },
                        )
                      }
                    />
                  ) : (
                    <PanelNote>{t('workingTree.clean')}</PanelNote>
                  )
                ) : panel === 'noCommits' ? (
                  <PanelNote>{t('repo.emptyHint')}</PanelNote>
                ) : (
                  <Details
                    session={current}
                    onHistory={(path, from) => setMain({ kind: 'history', path, from })}
                    rows={cacheFor(current.path)}
                    pending={tree ? tree.staged + tree.unstaged : 0}
                    conflicts={tree?.conflicts ?? 0}
                    onCopy={copy}
                    onOpenWorkingTree={() => select(0)}
                    onOpenFile={(commit, file) =>
                      setMain({ kind: 'diff', target: { kind: 'commit', commit, file } })
                    }
                  />
                )}
              </aside>
              </div>
              </div>
              <BottomBar
                zoom={zoom}
                onZoom={setZoom}
                ready={readyUpdate}
                onRestart={() => void restartToUpdate()}
              />
              </div>
          </>
        )}
        </div>

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
