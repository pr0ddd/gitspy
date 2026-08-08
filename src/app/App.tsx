import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { METRICS_AVATARS, METRICS_COMPACT } from '@/entities/graph';
import { notifyError } from '@/toast';
import * as ipc from '@/ipc';
import { readPref, usePref, writePref } from '@/prefs';
import { EMPTY, sessionsReducer } from '@/entities/repo';

import { useCommitSearch } from '@/features/search';
import { panelFor } from '@/entities/repo';
import { restartToUpdate, useReadyUpdate } from '@/features/updater';
import {
  copyText as copy,
  openExternalUrl as openUrl,
  useOperations,
  useCommitDraft,
  useRepoData,
  useRepoLoading,
  useSessionActions,
} from '@/features/repo';
import { useZoom } from '@/zoom';
import { clampAutofetch, SETTINGS } from '@/settingsModel';
import { BottomBar } from '@/widgets/BottomBar';
import { DetailsPane } from '@/widgets/DetailsPane';
import type {
  AccountView,
  Operation,
  PathOperation,
  PullListView,
  PullView,
  RecentRepo,
  WorkingTreeView,
} from '@/types';

type Main =
  | { kind: 'graph' }
  | { kind: 'diff'; target: DiffTarget }
  | { kind: 'conflict'; path: string }
  | { kind: 'history'; path: string; from?: string }
  | { kind: 'pull'; pull: PullView };
import { RepoTabs } from '@/widgets/RepoTabs';
import { Toolbar } from '@/widgets/Toolbar';
import { ConfirmBar } from '@/widgets/ConfirmBar';
import { Sidebar } from '@/widgets/Sidebar';
import { Details } from '@/widgets/Details';
import { GraphView } from '@/widgets/GraphView';
import { StartPage } from '@/widgets/StartPage';
import { DiffView, sameDiffTarget, type DiffTarget } from '@/widgets/DiffView';
import { ConflictView } from '@/widgets/ConflictView';
import { FileHistoryView } from '@/widgets/FileHistoryView';
import { WorkingTree } from '@/widgets/WorkingTree';
import { Settings } from '@/widgets/Settings';
import { applyStoredAppearance } from '@/appearance';
import { RepoDialog } from '@/widgets/RepoDialog';
import { AskBar, type Ask } from '@/widgets/AskBar';
import { PullPanel } from '@/widgets/PullPanel';
import { TerminalDock } from '@/widgets/TerminalDock';
import { RightPaneSwitch, type RightPane } from '@/widgets/RightPaneSwitch';
import { ReviewView } from '@/widgets/ReviewView';
import { viewForEntry } from '@/entities/diff';
import { cn } from '@/lib/utils';

export default function App() {
  const { t } = useTranslation();

  const [world, dispatch] = useReducer(sessionsReducer, EMPTY);
  const { sessions, active } = world;
  const [recent, setRecent] = useState<RecentRepo[]>([]);
  const [main, setMain] = useState<Main>({ kind: 'graph' });
  const toggleDiff = (target: DiffTarget) =>
    setMain((shown) =>
      shown.kind === 'diff' && sameDiffTarget(shown.target, target)
        ? { kind: 'graph' }
        : { kind: 'diff', target },
    );
  const [pulls, setPulls] = useState<PullListView | null>(null);
  const [tree, setTree] = useState<WorkingTreeView | null>(null);
  const [confirming, setConfirming] = useState<Operation | null>(null);
  const adoptTree = useCallback((next: WorkingTreeView) => {
    setTree((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, []);
  const [settings, setSettings] = useState<'closed' | 'open' | 'active'>('closed');
  const [adding, setAdding] = useState<{ mode: 'clone' | 'init'; url: string } | null>(null);
  const [account, setAccount] = useState<AccountView | null>(null);
  const [railed, setRailed] = useState(() => readPref('sidebar.collapsed', false));
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
  const [dockOpen, setDockOpen] = usePref('term.dock.open', false);
  const [dockFull, setDockFull] = usePref('term.dock.fullscreen', false);
  const [rightPane, setRightPane] = usePref<RightPane>('term.dock.rightPane', 'graph');
  const data = useRepoData();
  const { cacheFor, refill, refillFirstWindow, fetchChunks, drop, version: redraw } = data;

  const current = sessions.find((s) => s.path === active) ?? null;
  const headRow = current ? cacheFor(current.path).row(1) : null;
  const previousCommit =
    headRow?.kind === 'commit' ? { subject: headRow.subject, body: headRow.body } : null;
  const pullHeads = useMemo(
    () => new Set((pulls?.pulls ?? []).filter((p) => !p.fromFork).map((p) => p.headBranch)),
    [pulls],
  );
  const panel = panelFor(
    current ? cacheFor(current.path).row(current.selected) : undefined,
    current?.repo?.count ?? 0,
  );

  useEffect(() => {
    applyStoredAppearance();
  }, []);

  useEffect(() => {
    ipc.recentRepos().then(setRecent).catch(notifyError);
    void ipc
      .setAutofetchMinutes(clampAutofetch(readPref(SETTINGS.autofetchMinutes, 1)))
      .catch(() => undefined);
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
    const toggleDock = (e: KeyboardEvent) => {
      if (e.key !== '`' || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      setDockOpen(!dockOpen);
    };
    window.addEventListener('keydown', toggleDock);
    return () => window.removeEventListener('keydown', toggleDock);
  }, [dockOpen, setDockOpen]);

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
  const { avatars, avatarTick, load, reload } = useRepoLoading({
    active,
    dispatch,
    refill,
    refillFirstWindow,
    redraw,
    adoptTree,
    setRecent,
    remotes,
  });

  useEffect(() => {
    setMain({ kind: 'graph' });
    setPulls(null);
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
  }, [active, adoptTree]);

  const { runOperation, checkoutRef } = useOperations(active, reload);

  const { message, setMessage, description, setDescription, amend, setAmend, commit } =
    useCommitDraft({
      active,
      mergeSubject: tree?.merging?.subject ?? null,
      reload,
      adoptTree,
      onCommitted: () => {
        if (readPref<boolean>('commit.push', false)) void runOperation({ kind: 'push' });
      },
    });

  const { openPath, pickRepo, closeRepo, forget, favorite } = useSessionActions({
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

  const openFileFromTerminal = useCallback(
    (path: string) => {
      const changed = tree?.entries.find((entry) => entry.path === path);
      if (!changed) {
        setMain({ kind: 'history', path });
        return;
      }
      setMain({
        kind: 'diff',
        target: {
          kind: 'workingTree',
          path,
          status: changed.letter,
          staged: changed.staged,
        },
      });
    },
    [tree],
  );

  const revealCommitByHash = useCallback(
    (oid: string) => {
      if (!active) return;
      ipc
        .searchCommits(active, oid)
        .then((hits) => hits.length > 0 && revealCommit(hits[0]))
        .catch(notifyError);
    },
    [active, revealCommit],
  );

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
    [active, adoptTree],
  );

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
    [active, runOperation, t],
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

        {current === null || settings === 'active' ? (
          <div className="h-10 shrink-0" />
        ) : confirming ? (
          <ConfirmBar
            operation={confirming}
            onConfirm={(operation) => {
              setConfirming(null);
              runOperation(operation);
            }}
            onCancel={() => setConfirming(null)}
          />
        ) : asking ? (
          <AskBar
            ask={asking}
            onOpenChange={(next) => !next && setAsking(null)}
            onRun={runOperation}
          />
        ) : (
          <Toolbar
            repo={current.path}
            tree={tree}
            onRun={runOperation}
            onAsk={(kind) => setAsking({ kind })}
            onTerminal={() => setDockOpen(!dockOpen)}
            search={search.query}
            found={search.found}
            at={search.at}
            onSearch={search.setQuery}
            onStep={search.step}
          />
        )}

        <div className="flex min-h-0 flex-1 pt-1.5 pr-2">
          {settings === 'active' ? (
            <Settings
              open
              account={account}
              collapsed={railed}
              zoom={zoom}
              onZoom={setZoom}
              compact={compact}
              onCompact={setCompact}
              onToggle={toggleRail}
              onDisconnected={() => setAccount(null)}
            />
          ) : current === null ? (
            <StartPage
              recent={recent}
              onOpen={pickRepo}
              onOpenPath={openPath}
              onForget={forget}
              onFavorite={favorite}
              onClone={(url) => setAdding({ mode: 'clone', url })}
              onCreate={() => setAdding({ mode: 'init', url: '' })}
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
              <div
                className={cn(
                  'relative flex min-h-0 min-w-0 flex-1',
                  dockOpen && dockFull
                    ? 'gap-2'
                    : 'bg-card flex-col overflow-hidden rounded-xl border',
                )}
              >
                <div
                  className={cn(
                    'flex min-h-0 min-w-0 flex-1',
                    dockOpen && dockFull
                      ? 'bg-card order-2 w-[46%] flex-none flex-col overflow-hidden rounded-xl border'
                      : '',
                  )}
                >
                  {dockOpen && dockFull ? (
                    <RightPaneSwitch
                      pane={main.kind === 'graph' ? rightPane : 'changes'}
                      changes={tree ? tree.staged + tree.unstaged : 0}
                      context={
                        main.kind === 'graph' && rightPane === 'changes'
                          ? t('review.title', { branch: tree?.branch ?? t('review.detached') })
                          : null
                      }
                      onPane={(next) => {
                        setRightPane(next);
                        if (next === 'changes') select(0);
                      }}
                    />
                  ) : null}
                  {dockOpen && dockFull && rightPane === 'changes' && main.kind === 'graph' ? (
                    tree ? (
                      <ReviewView
                        repo={current.path}
                        tree={tree}
                        onOpenFile={(entry) =>
                          toggleDiff({
                            kind: 'workingTree',
                            path: entry.path,
                            status: entry.letter,
                            staged: entry.staged,
                          })
                        }
                      />
                    ) : null
                  ) : null}
                  <div className="flex min-h-0 min-w-0 flex-1">
                    {dockOpen &&
                    dockFull &&
                    rightPane === 'changes' &&
                    main.kind === 'graph' ? null : (
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
                            avatars={avatars}
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
                            avatars={avatars}
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
                    )}
                    {dockOpen && dockFull ? null : (
                      <DetailsPane
                        fill={dockOpen && dockFull && rightPane === 'changes'}
                        note={
                          panel === 'workingTree' && !(tree && tree.entries.length > 0)
                            ? 'workingTreeClean'
                            : panel === 'noCommits'
                              ? 'noCommits'
                              : null
                        }
                      >
                        {panel === 'workingTree' && tree ? (
                          <WorkingTree
                            repo={current.path}
                            tree={tree}
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
                              viewForEntry(status, staged) === 'conflict'
                                ? setMain({ kind: 'conflict', path })
                                : toggleDiff({ kind: 'workingTree', path, status, staged })
                            }
                          />
                        ) : (
                          <Details
                            session={current}
                            avatars={avatars}
                            avatarTick={avatarTick}
                            onHistory={(path, from) => setMain({ kind: 'history', path, from })}
                            rows={cacheFor(current.path)}
                            pending={tree ? tree.staged + tree.unstaged : 0}
                            conflicts={tree?.conflicts ?? 0}
                            pulls={pulls?.pulls ?? []}
                            onCopy={copy}
                            onOpenWorkingTree={() => select(0)}
                            onOpenPull={(pull) => setMain({ kind: 'pull', pull })}
                            onOpenFile={(commit, file) =>
                              toggleDiff({ kind: 'commit', commit, file })
                            }
                          />
                        )}
                      </DetailsPane>
                    )}
                  </div>
                </div>
                {dockOpen ? (
                  <TerminalDock
                    repo={current.path}
                    onFileLink={openFileFromTerminal}
                    onHashLink={revealCommitByHash}
                    fullscreen={dockFull}
                    onFullscreen={() => setDockFull(!dockFull)}
                  />
                ) : null}
              </div>
            </>
          )}
        </div>

        <BottomBar
          zoom={zoom}
          onZoom={setZoom}
          ready={readyUpdate}
          onRestart={() => void restartToUpdate()}
        />

        <RepoDialog
          open={adding !== null}
          mode={adding?.mode ?? 'clone'}
          url={adding?.url ?? ''}
          onOpenChange={(next) => !next && setAdding(null)}
          onCloned={openPath}
        />

        <Toaster
          position="bottom-right"
          offset={16}
          style={{ '--width': '430px' } as React.CSSProperties}
        />
      </div>
    </TooltipProvider>
  );
}
