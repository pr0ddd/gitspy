import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { Toaster } from 'sonner';
import { METRICS_AVATARS, METRICS_COMPACT } from './render';
import { notifyCopied, notifyError } from './toast';
import * as ipc from './ipc';
import { groupRefsByCommit, newSession, type Session } from './session';
import { RepoTabs } from './shell/RepoTabs';
import { Toolbar } from './shell/Toolbar';
import { Sidebar } from './shell/Sidebar';
import { Details } from './shell/Details';
import { GraphView } from './shell/GraphView';

const PAGE = 5000;

export default function App() {
  const { t } = useTranslation();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [avatars, setAvatars] = useState(true);

  const metrics = avatars ? METRICS_AVATARS : METRICS_COMPACT;
  const current = sessions.find((s) => s.path === active) ?? null;

  const update = useCallback((path: string, patch: Partial<Session>) => {
    setSessions((all) => all.map((s) => (s.path === path ? { ...s, ...patch } : s)));
  }, []);

  const load = useCallback(
    async (path: string) => {
      try {
        const started = performance.now();
        const layout = await ipc.openRepo(path);
        update(path, {
          layout,
          openMs: performance.now() - started,
          refsByCommit: groupRefsByCommit(layout.refs),
          loading: false,
        });

        void ipc.worktrees(path).then((found) => update(path, { worktrees: found }));

        const meta = newSession(path).meta;
        const startedMeta = performance.now();
        for (let start = 0; start < layout.count; start += PAGE) {
          const items = await ipc.commitRange(path, start, PAGE);
          for (const item of items) {
            meta.hash[item.index] = item.hash;
            meta.author[item.index] = item.author;
            meta.email[item.index] = item.email;
            meta.time[item.index] = item.time;
            meta.subject[item.index] = item.subject;
            meta.body[item.index] = item.body;
          }
          update(path, { meta: { ...meta } });
        }
        update(path, { metaMs: performance.now() - startedMeta });
      } catch (e) {
        notifyError(e);
        update(path, { loading: false, layout: null });
      }
    },
    [update],
  );

  const addRepo = useCallback(async () => {
    const picked = await openDialog({
      directory: true,
      multiple: false,
      title: t('repo.pickTitle'),
    });
    if (typeof picked !== 'string') return;

    setSessions((all) => (all.some((s) => s.path === picked) ? all : [...all, newSession(picked)]));
    setActive(picked);
    void load(picked);
  }, [t, load]);

  const closeRepo = useCallback(
    (path: string) => {
      void ipc.closeRepo(path);
      setSessions((all) => {
        const rest = all.filter((s) => s.path !== path);
        setActive((current) => (current === path ? (rest[0]?.path ?? null) : current));
        return rest;
      });
    },
    [],
  );

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
    <div className="app">
      <RepoTabs
        sessions={sessions}
        active={active}
        onActivate={setActive}
        onClose={closeRepo}
        onAdd={addRepo}
      />
      <Toolbar session={current} avatars={avatars} onAvatars={setAvatars} />

      <div className="workspace">
        <Sidebar session={current} onPick={select} />
        <main className="centre">
          <GraphView session={current} metrics={metrics} onSelect={select} />
          {current?.layout ? (
            <footer className="status">
              {[
                t('graph.commits', { count: current.layout.count }),
                t('graph.lanes', { count: current.layout.max_lane + 1 }),
                t('stats.read', { ms: current.layout.read_ms.toFixed(0) }),
                t('stats.layout', { ms: current.layout.layout_ms.toFixed(1) }),
                current.openMs === null ? null : t('stats.ipc', { ms: current.openMs.toFixed(0) }),
                current.metaMs === null ? null : t('stats.meta', { ms: current.metaMs.toFixed(0) }),
                current.layout.truncated ? t('graph.truncated') : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </footer>
          ) : null}
        </main>
        <Details session={current} onCopy={copy} />
      </div>

      <Toaster
        theme="dark"
        position="bottom-right"
        gap={8}
        offset={16}
        toastOptions={{ classNames: { toast: 'gs-toast' } }}
      />
    </div>
  );
}
