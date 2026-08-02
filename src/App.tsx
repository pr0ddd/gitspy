import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { METRICS_AVATARS } from './render';
import { notifyCopied, notifyError, notifyOperation } from './toast';
import * as ipc from './ipc';
import { groupRefsByCommit, newSession, type Session } from './session';
import { CHUNK, RowCache } from './rows';
import type { ChangedFileView, Operation, RecentRepo } from './types';
import { RepoTabs } from './shell/RepoTabs';
import { Toolbar } from './shell/Toolbar';
import { Sidebar } from './shell/Sidebar';
import { Details } from './shell/Details';
import { GraphView } from './shell/GraphView';
import { StartPage } from './shell/StartPage';
import { DiffView } from './shell/DiffView';



export default function App() {
  const { t } = useTranslation();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentRepo[]>([]);
  const [redraw, setRedraw] = useState(0);
  const [busy, setBusy] = useState(false);
  const [openFile, setOpenFile] = useState<{ commit: string; file: ChangedFileView } | null>(null);
  const caches = useRef(new Map<string, RowCache>());

  const cacheFor = useCallback((path: string) => {
    let cache = caches.current.get(path);
    if (!cache) {
      cache = new RowCache();
      caches.current.set(path, cache);
    }
    return cache;
  }, []);

  const current = sessions.find((s) => s.path === active) ?? null;

  useEffect(() => {
    ipc.recentRepos().then(setRecent).catch(notifyError);
  }, []);

  useEffect(() => {
    const stop = ipc.onRepoChanged((path) => {
      const cache = caches.current.get(path);
      if (cache) cache.clear();
      void reload(path);
    });
    return () => {
      void stop.then((off) => off());
    };
  }, []);

  const update = useCallback((path: string, patch: Partial<Session>) => {
    setSessions((all) => all.map((s) => (s.path === path ? { ...s, ...patch } : s)));
  }, []);

  const load = useCallback(
    async (path: string) => {
      try {
        const repo = await ipc.openRepo(path);
        const cache = cacheFor(path);
        cache.clear();
        cache.put(0, await ipc.graphWindow(path, 0, CHUNK));
        update(path, {
          repo,
          refsByCommit: groupRefsByCommit(repo.refs),
          loading: false,
        });

        void ipc.recentRepos().then(setRecent);
        void ipc.worktrees(path).then((found) => update(path, { worktrees: found }));
      } catch (e) {
        notifyError(e);
        setSessions((all) => all.filter((s) => s.path !== path));
        setActive(null);
      }
    },
    [update, cacheFor],
  );

  const fetchChunks = useCallback(
    (path: string, chunks: number[]) => {
      const cache = cacheFor(path);
      for (const chunk of chunks) {
        ipc
          .graphWindow(path, chunk * CHUNK, CHUNK)
          .then((window) => {
            cache.put(chunk, window);
            setRedraw((n) => n + 1);
          })
          .catch(notifyError);
      }
    },
    [cacheFor],
  );

  const reload = useCallback(
    async (path: string) => {
      try {
        const repo = await ipc.openRepo(path);
        const cache = cacheFor(path);
        cache.clear();
        cache.put(0, await ipc.graphWindow(path, 0, CHUNK));
        update(path, { repo, refsByCommit: groupRefsByCommit(repo.refs) });
        setRedraw((n) => n + 1);
      } catch (e) {
        notifyError(e);
      }
    },
    [update, cacheFor],
  );

  const runOperation = useCallback(
    (operation: Operation) => {
      if (!active) return;
      setBusy(true);
      notifyOperation(operation, 'started');

      ipc
        .runOperation(active, operation, () => {})
        .then(() => {
          notifyOperation(operation, 'finished');
          return reload(active);
        })
        .catch(notifyError)
        .finally(() => setBusy(false));
    },
    [active, reload],
  );

  const openPath = useCallback(
    (path: string) => {
      setSessions((all) => (all.some((s) => s.path === path) ? all : [...all, newSession(path)]));
      setActive(path);
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

  const closeRepo = useCallback((path: string) => {
    void ipc.closeRepo(path);
    setSessions((all) => {
      const rest = all.filter((s) => s.path !== path);
      setActive((now) => (now === path ? (rest[rest.length - 1]?.path ?? null) : now));
      return rest;
    });
  }, []);

  const forget = useCallback((path: string) => {
    ipc.forgetRepo(path).then(setRecent).catch(notifyError);
  }, []);

  const select = useCallback(
    (index: number | null) => {
      if (active) update(active, { selected: index });
    },
    [active, update],
  );

  const onNeed = useCallback(
    (chunks: number[]) => {
      if (active) fetchChunks(active, chunks);
    },
    [active, fetchChunks],
  );

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
        onActivate={setActive}
        onClose={closeRepo}
        onStart={() => setActive(null)}
      />

      {current === null ? (
        <StartPage
          recent={recent}
          onOpen={pickRepo}
          onOpenPath={openPath}
          onForget={forget}
        />
      ) : (
        <>
          <Toolbar session={current} onRun={runOperation} busy={busy} />
          <div className="flex min-h-0 flex-1">
            <Sidebar
              session={current}
              collapsed={openFile !== null}
              onPick={select}
              onExpand={() => setOpenFile(null)}
            />
            <main className="flex min-h-0 min-w-0 flex-1 flex-col">
              {openFile && current.repo ? (
                <DiffView
                  repo={current.path}
                  commit={openFile.commit}
                  file={openFile.file}
                  onClose={() => setOpenFile(null)}
                />
              ) : (
                <>
              <GraphView
                key={current.path}
                session={current}
                rows={cacheFor(current.path)}
                redraw={redraw}
                metrics={METRICS_AVATARS}
                onSelect={select}
                onNeed={onNeed}
                onCopyHash={copy}
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
            <Details
              session={current}
              rows={cacheFor(current.path)}
              onCopy={copy}
              onOpenFile={(commit, file) => setOpenFile({ commit, file })}
            />
          </div>
        </>
      )}

        <Toaster position="bottom-right" offset={16} />
      </div>
    </TooltipProvider>
  );
}
