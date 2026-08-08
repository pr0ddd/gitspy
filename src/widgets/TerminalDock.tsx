import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { activeOf as activeAgentOf, agentsOfRepo, useAgentSessions } from '@/entities/agent';
import type { AgentStatus } from '@/entities/agent';
import {
  activeOf as activeTermOf,
  createTermHost,
  sessionsOfRepo,
  useTermSessions,
} from '@/entities/terminal';
import type { TermHost, TermStatus } from '@/entities/terminal';
import { openAgentSession } from '@/features/agent';
import {
  detectLinks,
  parseOsc133,
  parseOsc7,
  readProfiles,
  type Osc133,
  type TermProfile,
} from '@/features/terminal';
import { Icon } from '@/icons';
import { cn } from '@/lib/utils';
import { ListRow, PanelBar, PanelNote, ResizeGrip } from '@/parts';
import { usePref } from '@/prefs';
import { notifyError } from '@/toast';
import { AGENT_STATUS_LABEL } from './agent/AgentChips';
import { AgentSessionView } from './AgentSessionView';

type Props = {
  repo: string;
  onFileLink: (path: string, line?: number) => void;
  onHashLink: (oid: string) => void;
  fullscreen?: boolean;
  onFullscreen?: () => void;
  onClose?: () => void;
};

const REFIT_CALM_MS = 90;

const OSC_CWD = 7;
const OSC_PROMPT = 133;

const SHARE = { min: 0.15, max: 0.85, fallback: 0.35 };

const clampShare = (share: number): number =>
  Number.isFinite(share) ? Math.min(SHARE.max, Math.max(SHARE.min, share)) : SHARE.fallback;

const STATUS_DOT: Record<TermStatus, string> = {
  running: 'bg-added',
  failed: 'bg-modified',
  idle: 'bg-muted-foreground',
  exited: 'bg-muted-foreground',
};

const AGENT_DOT: Record<AgentStatus, string> = {
  waiting: 'bg-modified animate-pulse',
  working: 'bg-added',
  stopping: 'bg-added animate-pulse',
  ready: 'bg-muted-foreground',
  dead: 'bg-deleted',
};

type DockEntry = { kind: 'term' | 'agent'; id: number };

const statusAfterPrompt = (mark: Osc133): TermStatus | null => {
  if (mark.phase === 'C') return 'running';
  if (mark.phase !== 'D') return null;
  return mark.exit === undefined || mark.exit === 0 ? 'idle' : 'failed';
};

const livePanes = new Map<number, { el: HTMLDivElement; host: TermHost }>();

const paneElement = (): HTMLDivElement => {
  const el = document.createElement('div');
  el.className = 'size-full';
  return el;
};

function RailButton({
  label,
  current,
  dot,
  onClick,
  children,
}: {
  label: string;
  current: boolean;
  dot: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant={current ? 'secondary' : 'muted'}
      size="icon-xs"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="relative"
    >
      {children}
      <span className={cn('absolute right-0.5 bottom-0.5 size-1.5 rounded-full', dot)} />
    </Button>
  );
}

export function TerminalDock({
  repo,
  onFileLink,
  onHashLink,
  fullscreen,
  onFullscreen,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const allSessions = useTermSessions((state) => state.sessions);
  const allAgents = useAgentSessions((state) => state.sessions);
  const activeTermId = useTermSessions((state) => activeTermOf(state, repo));
  const activeAgentId = useAgentSessions((state) => activeAgentOf(state, repo));
  const add = useTermSessions((state) => state.add);
  const drop = useTermSessions((state) => state.remove);
  const setActive = useTermSessions((state) => state.setActive);
  const setTitle = useTermSessions((state) => state.setTitle);
  const setStatus = useTermSessions((state) => state.setStatus);
  const setCwd = useTermSessions((state) => state.setCwd);
  const setAgentActive = useAgentSessions((state) => state.setActive);

  const [side] = usePref<'bottom' | 'right'>('term.dock.side', 'bottom');
  const [share, setShare] = usePref<number>('term.dock.size', SHARE.fallback);
  const [listOpen, setListOpen] = useState(true);
  const [starting, setStarting] = useState(0);
  const rootRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const shareAtDragStart = useRef(share);
  const draggedShare = useRef(share);
  const profiles = readProfiles();

  const sessions = useMemo(
    () => sessionsOfRepo({ sessions: allSessions }, repo),
    [allSessions, repo],
  );
  const agents = useMemo(() => agentsOfRepo({ sessions: allAgents }, repo), [allAgents, repo]);

  const active: DockEntry | null =
    activeAgentId !== null
      ? { kind: 'agent', id: activeAgentId }
      : activeTermId !== null
        ? { kind: 'term', id: activeTermId }
        : null;
  const stagedTermId = active?.kind === 'term' ? active.id : null;

  const applyMark = useCallback(
    (id: number, code: number, data: string) => {
      if (code === OSC_CWD) {
        const cwd = parseOsc7(data);
        if (cwd) setCwd(id, cwd);
        return;
      }
      if (code !== OSC_PROMPT) return;
      const mark = parseOsc133(data);
      const next = mark && statusAfterPrompt(mark);
      if (next) setStatus(id, next);
    },
    [setCwd, setStatus],
  );

  const openSession = useCallback(
    (profile: TermProfile) => {
      const stage = stageRef.current;
      if (!stage) return;
      const el = paneElement();
      for (const pane of livePanes.values()) pane.el.hidden = true;
      stage.append(el);
      const opened: { id: number | null } = { id: null };
      const forOpened = (act: (id: number) => void) => {
        if (opened.id !== null) act(opened.id);
      };
      createTermHost(el, {
        cwd: repo,
        command: profile.command,
        integration: true,
        detect: detectLinks,
        hooks: {
          onTitle: (title) => forOpened((id) => setTitle(id, title)),
          onOsc: (code, data) => forOpened((id) => applyMark(id, code, data)),
          onFileLink,
          onHashLink,
        },
      })
        .then((host) => {
          opened.id = host.id;
          livePanes.set(host.id, { el, host });
          setAgentActive(repo, null);
          add({
            id: host.id,
            title: profile.label,
            command: profile.command,
            cwd: repo,
            repo,
            status: 'idle',
          });
        })
        .catch((reason) => {
          el.remove();
          if (stagedTermId !== null) {
            const kept = livePanes.get(stagedTermId);
            if (kept) kept.el.hidden = false;
          }
          notifyError(reason);
        });
    },
    [add, applyMark, onFileLink, onHashLink, repo, setAgentActive, setTitle, stagedTermId],
  );

  const startAgent = useCallback(() => {
    setStarting((waiting) => waiting + 1);
    openAgentSession(repo)
      .catch(notifyError)
      .finally(() => setStarting((waiting) => waiting - 1));
  }, [repo]);

  const startProfile = useCallback(
    (profile: TermProfile) => {
      if (profile.kind === 'acp') startAgent();
      else openSession(profile);
    },
    [openSession, startAgent],
  );

  const showTerm = useCallback(
    (id: number) => {
      setAgentActive(repo, null);
      setActive(repo, id);
    },
    [repo, setActive, setAgentActive],
  );

  const showAgent = useCallback((id: number) => setAgentActive(repo, id), [repo, setAgentActive]);

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
    if (!stage) return;
    let calm = 0;
    const watch = new ResizeObserver(() => {
      if (stagedTermId === null) return;
      window.clearTimeout(calm);
      calm = window.setTimeout(() => {
        livePanes.get(stagedTermId)?.host.fit();
      }, REFIT_CALM_MS);
    });
    watch.observe(stage);
    return () => {
      window.clearTimeout(calm);
      watch.disconnect();
    };
  }, [stagedTermId]);

  const spanOfDockParent = (): number => {
    const box = rootRef.current?.parentElement?.getBoundingClientRect();
    if (!box) return 0;
    return side === 'bottom' ? box.height : box.width;
  };

  return (
    <section
      ref={rootRef}
      className={cn(
        'border-border bg-card flex min-h-0 min-w-0 flex-col overflow-hidden',
        fullscreen
          ? 'flex-1 rounded-xl border'
          : cn(
              'absolute z-30 shadow-2xl',
              side === 'bottom' ? 'inset-x-0 bottom-0 border-t' : 'inset-y-0 right-0 border-l',
            ),
      )}
      style={
        fullscreen
          ? undefined
          : side === 'bottom'
            ? { height: `${clampShare(share) * 100}%` }
            : { width: `${clampShare(share) * 100}%` }
      }
    >
      <ResizeGrip
        edge={side === 'bottom' ? 'top' : 'left'}
        onStart={() => {
          shareAtDragStart.current = clampShare(share);
        }}
        onMove={(delta) => {
          const span = spanOfDockParent();
          if (span <= 0) return;
          draggedShare.current = clampShare(shareAtDragStart.current - delta / span);
          const root = rootRef.current;
          if (!root) return;
          if (side === 'bottom') root.style.height = `${draggedShare.current * 100}%`;
          else root.style.width = `${draggedShare.current * 100}%`;
        }}
        onEnd={() => setShare(draggedShare.current)}
      />

      <div className="flex min-h-0 flex-1">
        <div className="relative flex min-h-0 min-w-0 flex-1">
          <div ref={stageRef} className="min-h-0 min-w-0 flex-1 p-2" />
          {active?.kind === 'agent' ? (
            <div className="bg-background absolute inset-0 flex">
              <AgentSessionView id={active.id} repo={repo} />
            </div>
          ) : null}
          {sessions.length === 0 && agents.length === 0 && starting === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <PanelNote>{t('term.empty')}</PanelNote>
              <Button variant="outline" size="xs" onClick={() => startProfile(profiles[0])}>
                <Icon.add />
                {t('term.new')}
              </Button>
            </div>
          ) : null}
        </div>

        <aside
          className={cn(
            'border-border bg-card flex shrink-0 flex-col border-l',
            listOpen ? 'w-64' : 'w-12',
          )}
        >
          {listOpen ? (
            <>
              <PanelBar>
                <span className="group/split ml-auto flex items-center rounded-md">
                  <Button
                    variant="split"
                    size="icon-xs"
                    aria-label={t('term.new')}
                    onClick={() => startProfile(profiles[0])}
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
                        <DropdownMenuItem
                          key={profile.label}
                          onSelect={() => startProfile(profile)}
                        >
                          {profile.kind === 'acp' ? <Icon.sparkle /> : <Icon.terminal />}
                          {profile.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>
                {onFullscreen ? (
                  <Button
                    variant="muted"
                    size="icon-xs"
                    aria-label={fullscreen ? t('term.windowed') : t('term.fullscreen')}
                    onClick={onFullscreen}
                  >
                    {fullscreen ? <Icon.windowed /> : <Icon.fullscreen />}
                  </Button>
                ) : null}
                <Button
                  variant="muted"
                  size="icon-xs"
                  aria-label={t('term.sessionsCollapse')}
                  onClick={() => setListOpen(false)}
                >
                  <Icon.expand />
                </Button>
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

              <div className="min-h-0 flex-1 overflow-y-auto p-1">
                {sessions.map((session) => (
                  <ListRow
                    key={`term-${session.id}`}
                    as="div"
                    current={active?.kind === 'term' && session.id === active.id}
                    title={session.cwd}
                    onClick={() => showTerm(session.id)}
                  >
                    <Icon.terminal className="size-3 shrink-0 opacity-75" />
                    <span className="min-w-0 flex-1 truncate">{session.title}</span>
                    {session.status === 'exited' ? (
                      <span className="text-muted-foreground text-2xs">{t('term.exited')}</span>
                    ) : (
                      <span
                        className={cn('size-1.5 shrink-0 rounded-full', STATUS_DOT[session.status])}
                      />
                    )}
                    <Button
                      variant="muted"
                      size="icon-2xs"
                      reveal
                      aria-label={t('term.close')}
                      onClick={() => closeSession(session.id)}
                    >
                      <Icon.close />
                    </Button>
                  </ListRow>
                ))}
                {Array.from({ length: starting }, (_, waiting) => (
                  <ListRow key={`starting-${waiting}`} as="div">
                    <Icon.sparkle className="size-3 shrink-0 opacity-75" />
                    <span className="text-muted-foreground min-w-0 flex-1 truncate">
                      {t('agent.starting')}
                    </span>
                    <span className="bg-added size-1.5 shrink-0 animate-pulse rounded-full" />
                  </ListRow>
                ))}
                {agents.map((agent) => (
                  <ListRow
                    key={`agent-${agent.id}`}
                    as="div"
                    current={active?.kind === 'agent' && agent.id === active.id}
                    onClick={() => showAgent(agent.id)}
                  >
                    <Icon.sparkle className="size-3 shrink-0 opacity-75" />
                    <span className="min-w-0 flex-1 truncate">{agent.title}</span>
                    <span
                      className={cn('size-1.5 shrink-0 rounded-full', AGENT_DOT[agent.status])}
                      title={t(AGENT_STATUS_LABEL[agent.status])}
                    />
                  </ListRow>
                ))}
              </div>
            </>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center gap-1 p-1">
              <Button
                variant="muted"
                size="icon-xs"
                aria-label={t('term.new')}
                onClick={() => startProfile(profiles[0])}
              >
                <Icon.add />
              </Button>
              <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto">
                {sessions.map((session) => (
                  <RailButton
                    key={`term-${session.id}`}
                    label={session.title}
                    current={active?.kind === 'term' && session.id === active.id}
                    dot={STATUS_DOT[session.status]}
                    onClick={() => showTerm(session.id)}
                  >
                    <Icon.terminal />
                  </RailButton>
                ))}
                {agents.map((agent) => (
                  <RailButton
                    key={`agent-${agent.id}`}
                    label={agent.title}
                    current={active?.kind === 'agent' && agent.id === active.id}
                    dot={AGENT_DOT[agent.status]}
                    onClick={() => showAgent(agent.id)}
                  >
                    <Icon.sparkle />
                  </RailButton>
                ))}
              </div>
              <Button
                variant="muted"
                size="icon-xs"
                aria-label={t('term.sessionsExpand')}
                onClick={() => setListOpen(true)}
              >
                <Icon.collapse />
              </Button>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
