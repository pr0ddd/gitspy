import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { METRICS_AVATARS } from './render';
import { notifyCopied, notifyError } from './toast';
import * as ipc from './ipc';
import { groupRefsByCommit, newSession, type Session } from './session';
import type { RecentRepo } from './types';
import { RepoTabs } from './shell/RepoTabs';
import { Toolbar } from './shell/Toolbar';
import { Sidebar } from './shell/Sidebar';
import { Details } from './shell/Details';
import { GraphView } from './shell/GraphView';
import { StartPage } from './shell/StartPage';

const MARGIN = 200;

export default function App() {
  const { t } = useTranslation();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentRepo[]>([]);
  const pending = useRef(new Map<string, { start: number; len: number }>());

  const current = sessions.find((s) => s.path === active) ?? null;

  useEffect(() => {
    ipc.recentRepos().then(setRecent).catch(notifyError);
  }, []);

  const update = useCallback((path: string, patch: Partial<Session>) => {
    setSessions((all) => all.map((s) => (s.path === path ? { ...s, ...patch } : s)));
  }, []);

  const load = useCallback(
    async (path: string) => {
      try {
        const repo = await ipc.openRepo(path);
        const window = await ipc.graphWindow(path, 0, MARGIN);
        update(path, {
          repo,
          window,
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
    [update],
  );

  const requestWindow = useCallback(
    (path: string, first: number, last: number) => {
      const session = pending.current.get(path);
      const start = Math.max(0, first - MARGIN);
      const len = last - start + MARGIN;
      if (session && session.start <= first && session.start + session.len >= last) return;
      pending.current.set(path, { start, len });

      ipc
        .graphWindow(path, start, len)
        .then((window) => update(path, { window }))
        .catch(notifyError);
    },
    [update],
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
          <Toolbar session={current} />
          <div className="flex min-h-0 flex-1">
            <Sidebar session={current} onPick={select} />
            <main className="flex min-w-0 min-h-0 flex-1 flex-col">
              <GraphView
                session={current}
                metrics={METRICS_AVATARS}
                onSelect={select}
                onRange={(first, last) => requestWindow(current.path, first, last)}
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
            </main>
            <Details session={current} onCopy={copy} />
          </div>
        </>
      )}

        <Toaster position="bottom-right" offset={16} />
      </div>
    </TooltipProvider>
  );
}
