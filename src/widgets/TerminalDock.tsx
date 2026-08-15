import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { activeOf, createTermHost, sessionsOfRepo, useTermSessions } from '@/entities/terminal';
import type { TermHost } from '@/entities/terminal';
import { detectLinks, readProfiles, type TermProfile } from '@/features/terminal';
import { Icon } from '@/icons';
import { PanelBar, PanelNote, ResizeGrip, Tab } from '@/parts';
import { useShareUnderCursor } from '@/resize';
import { notifyError } from '@/toast';

type Props = {
  repo: string;
  onFileLink: (path: string, line?: number) => void;
  onHashLink: (oid: string) => void;
  onClose?: () => void;
};

const SHARE = { min: 0.15, max: 0.85, fallback: 0.35 };

const livePanes = new Map<number, { el: HTMLDivElement; host: TermHost }>();

const paneElement = (): HTMLDivElement => {
  const el = document.createElement('div');
  el.className = 'size-full';
  return el;
};

export function TerminalDock({ repo, onFileLink, onHashLink, onClose }: Props) {
  const { t } = useTranslation();
  const allSessions = useTermSessions((state) => state.sessions);
  const stagedTermId = useTermSessions((state) => activeOf(state, repo));
  const add = useTermSessions((state) => state.add);
  const drop = useTermSessions((state) => state.remove);
  const setActive = useTermSessions((state) => state.setActive);
  const setTitle = useTermSessions((state) => state.setTitle);

  const dockShare = useShareUnderCursor('term.dock.size', SHARE.fallback, SHARE.min, SHARE.max);
  const [starting, setStarting] = useState(0);
  const askedForTheFirstTerminal = useRef(false);
  const rootRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const profiles = readProfiles();

  const sessions = useMemo(
    () => sessionsOfRepo({ sessions: allSessions }, repo),
    [allSessions, repo],
  );

  const openSession = useCallback(
    (profile: TermProfile) => {
      const stage = stageRef.current;
      if (!stage) return;
      const el = paneElement();
      for (const pane of livePanes.values()) pane.el.hidden = true;
      stage.append(el);
      setStarting((waiting) => waiting + 1);
      const opened: { id: number | null } = { id: null };
      const forOpened = (act: (id: number) => void) => {
        if (opened.id !== null) act(opened.id);
      };
      createTermHost(el, {
        cwd: repo,
        command: profile.command,
        detect: detectLinks,
        hooks: {
          onTitle: (title) => forOpened((id) => setTitle(id, title)),
          onFileLink,
          onHashLink,
        },
      })
        .then((host) => {
          opened.id = host.id;
          livePanes.set(host.id, { el, host });
          add({
            id: host.id,
            title: profile.label,
            command: profile.command,
            cwd: repo,
            repo,
          });
        })
        .catch((reason) => {
          el.remove();
          if (stagedTermId !== null) {
            const kept = livePanes.get(stagedTermId);
            if (kept) kept.el.hidden = false;
          }
          notifyError(reason);
        })
        .finally(() => setStarting((waiting) => waiting - 1));
    },
    [add, onFileLink, onHashLink, repo, setTitle, stagedTermId],
  );

  const closeSession = useCallback(
    (id: number) => {
      const pane = livePanes.get(id);
      livePanes.delete(id);
      pane?.host.dispose();
      pane?.el.remove();
      drop(id);
    },
    [drop],
  );

  useLayoutEffect(() => {
    if (askedForTheFirstTerminal.current || sessions.length > 0) return;
    askedForTheFirstTerminal.current = true;
    openSession(profiles[0]);
  }, [openSession, profiles, sessions.length]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    for (const [id, pane] of livePanes) {
      if (pane.el.parentElement !== stage) stage.append(pane.el);
      pane.el.hidden = id !== stagedTermId;
    }
  }, [stagedTermId, allSessions]);

  useEffect(() => {
    if (stagedTermId === null) return;
    const pane = livePanes.get(stagedTermId);
    pane?.host.fit();
    pane?.host.focus();
  }, [stagedTermId]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || stagedTermId === null) return;
    let pending = 0;
    const refitOnceThisFrame = () => {
      if (pending !== 0) return;
      pending = requestAnimationFrame(() => {
        pending = 0;
        livePanes.get(stagedTermId)?.host.fit();
      });
    };
    const watch = new ResizeObserver(refitOnceThisFrame);
    watch.observe(stage);
    return () => {
      if (pending !== 0) cancelAnimationFrame(pending);
      watch.disconnect();
    };
  }, [stagedTermId]);

  return (
    <section
      ref={rootRef}
      className="border-border bg-card absolute inset-x-0 bottom-0 z-30 flex min-h-0 min-w-0 flex-col overflow-hidden border-t shadow-2xl"
      style={{ height: `${dockShare.shown * 100}%` }}
    >
      <PanelBar>
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {sessions.map((session) => (
            <Tab
              key={`term-${session.id}`}
              icon="terminal"
              label={session.title}
              title={session.cwd}
              current={session.id === stagedTermId}
              closeLabel={t('term.close')}
              onSelect={() => setActive(repo, session.id)}
              onClose={() => closeSession(session.id)}
            />
          ))}
        </div>

        {profiles.length > 1 ? (
          <span className="group/split flex items-center rounded-md">
            <Button
              variant="split"
              size="icon-xs"
              aria-label={t('term.new')}
              onClick={() => openSession(profiles[0])}
            >
              <Icon.add />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="split" size="icon-xs" aria-label={t('term.profiles')}>
                  <Icon.chevron className="rotate-90" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {profiles.map((profile) => (
                  <DropdownMenuItem key={profile.label} onSelect={() => openSession(profile)}>
                    <Icon.terminal />
                    {profile.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        ) : (
          <Button
            variant="muted"
            size="icon-xs"
            aria-label={t('term.new')}
            onClick={() => openSession(profiles[0])}
          >
            <Icon.add />
          </Button>
        )}
        {onClose ? (
          <Button
            variant="muted"
            size="icon-xs"
            aria-label={t('term.closePanel')}
            onClick={onClose}
          >
            <Icon.close />
          </Button>
        ) : null}
      </PanelBar>

      <div className="relative flex min-h-0 min-w-0 flex-1">
        <div ref={stageRef} className="min-h-0 min-w-0 flex-1 p-2" />
        {sessions.length === 0 && starting === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <PanelNote>{t('term.empty')}</PanelNote>
            <Button variant="outline" size="xs" onClick={() => openSession(profiles[0])}>
              <Icon.add />
              {t('term.new')}
            </Button>
          </div>
        ) : null}
      </div>

      <ResizeGrip
        name="dock"
        label={t('term.resize')}
        edge="top"
        onStart={dockShare.begin}
        onMove={(delta) => dockShare.moved(rootRef.current, delta, 'y')}
        onEnd={dockShare.commit}
      />
    </section>
  );
}
