import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { FeedItem, TerminalOutcome } from '@/entities/agent';
import { onTerminalBytes, turnIsRunning, useAgentSessions } from '@/entities/agent';
import { createReadOnlyTermHost } from '@/entities/terminal';
import { answerPermission, feedOf, onFeed, rollbackCheckpoint } from '@/features/agent';
import { Icon } from '@/icons';
import { cn } from '@/lib/utils';
import { InlineNote } from '@/parts';
import { notifyError } from '@/toast';
import type { AcpOptionView, AcpPlanEntryView } from '@/types';

type Props = {
  id: number;
  repo: string;
};

type SubagentProps = {
  title: string;
  items: FeedItem[];
  done: boolean;
};

const SECOND = 1000;

const TOOL_DOT: Record<string, string> = {
  in_progress: 'bg-added',
  completed: 'bg-muted-foreground',
  failed: 'bg-modified',
};

const PLAN_DOT: Record<string, string> = {
  pending: 'bg-muted-foreground/40',
  in_progress: 'bg-added',
  completed: 'bg-muted-foreground',
};

const NAMED_OPTION: Record<string, 'agent.allow' | 'agent.deny' | undefined> = {
  allow: 'agent.allow',
  deny: 'agent.deny',
};

const useFeed = (id: number): FeedItem[] =>
  useSyncExternalStore(
    useCallback((changed: () => void) => onFeed(id, changed), [id]),
    useCallback(() => feedOf(id), [id]),
  );

const useSecondsSinceTurnStarted = (): number => {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const ticking = setInterval(() => setSeconds((passed) => passed + 1), SECOND);
    return () => clearInterval(ticking);
  }, []);
  return seconds;
};

const keyOfItem = (item: FeedItem, at: number): string => {
  if (item.kind === 'tool') return `tool:${item.id}`;
  if (item.kind === 'subagent') return `subagent:${item.id}`;
  if (item.kind === 'permission') return `permission:${item.requestId}`;
  if (item.kind === 'checkpoint') return `checkpoint:${item.oid ?? 'none'}:${at}`;
  return `${item.kind}:${at}`;
};

const callsInTranscript = (items: FeedItem[]): number =>
  items.filter((item) => item.kind === 'tool' || item.kind === 'subagent').length;

const transcriptDot = (done: boolean): string => TOOL_DOT[done ? 'completed' : 'in_progress'];

const TERMINAL_ROWS = 12;

function TerminalPanel({ terminalId }: { terminalId: string }) {
  const { t } = useTranslation();
  const mount = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    const host = createReadOnlyTermHost(el, TERMINAL_ROWS);
    const stop = onTerminalBytes(terminalId, (bytes) => host.write(bytes));
    return () => {
      stop();
      host.dispose();
    };
  }, [terminalId]);
  return <div ref={mount} role="log" aria-label={t('agent.output')} className="min-w-0" />;
}

const howTheCommandEnded = (
  exit: TerminalOutcome,
  named: (code: number) => string,
): string | null => exit.signal ?? (exit.code === null ? null : named(exit.code));

export function ToolCard({
  title,
  status,
  terminalId,
  exit,
}: {
  title: string;
  status: string;
  terminalId: string | null;
  exit: TerminalOutcome | null;
}) {
  const { t } = useTranslation();
  return (
    <div className="border-border bg-card flex flex-col rounded-md border">
      <div className="flex h-7 items-center gap-2 px-2 text-xs">
        <span
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            TOOL_DOT[status] ?? 'bg-muted-foreground',
          )}
        />
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {exit ? (
          <span className="text-muted-foreground text-2xs shrink-0 tabular-nums">
            {howTheCommandEnded(exit, (code) => t('agent.exit', { code }))}
          </span>
        ) : null}
      </div>
      {terminalId ? (
        <div className="border-border overflow-hidden border-t p-1">
          <TerminalPanel terminalId={terminalId} />
        </div>
      ) : null}
    </div>
  );
}

function PlanList({ entries }: { entries: AcpPlanEntryView[] }) {
  return (
    <div className="border-border bg-card flex flex-col gap-1 rounded-md border p-2">
      {entries.map((entry) => (
        <div key={entry.content} className="flex items-center gap-2 text-xs">
          <span
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              PLAN_DOT[entry.status] ?? 'bg-muted-foreground',
            )}
          />
          <span
            className={cn(
              'min-w-0 flex-1 truncate',
              entry.status === 'completed' && 'text-muted-foreground line-through',
            )}
          >
            {entry.content}
          </span>
        </div>
      ))}
    </div>
  );
}

function TurnActivity({ stopping }: { stopping: boolean }) {
  const { t } = useTranslation();
  const seconds = useSecondsSinceTurnStarted();
  return (
    <div className="text-muted-foreground text-2xs flex h-6 shrink-0 items-center gap-2">
      <span className="bg-added size-1.5 shrink-0 animate-pulse rounded-full" />
      <span>{t(stopping ? 'agent.stopping' : 'agent.working')}</span>
      <span className="tabular-nums">{t('agent.elapsed', { seconds })}</span>
    </div>
  );
}

function PermissionCard({
  title,
  options,
  resolved,
  onPick,
}: {
  title: string;
  options: AcpOptionView[];
  resolved: string | null;
  onPick: (optionId: string) => void;
}) {
  const { t } = useTranslation();
  const nameOf = (option: AcpOptionView) => {
    const named = NAMED_OPTION[option.id];
    return named ? t(named) : option.label;
  };
  const picked = options.find((option) => option.id === resolved);
  return (
    <div className="border-modified/40 bg-modified/5 flex flex-col gap-2 rounded-md border p-2">
      <span className="text-xs">{title}</span>
      {picked ? (
        <span className="text-muted-foreground text-2xs">{nameOf(picked)}</span>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {options.map((option) => (
            <Button
              key={option.id}
              variant={option.id === 'allow' ? 'default' : 'outline'}
              size="xs"
              onClick={() => onPick(option.id)}
            >
              {nameOf(option)}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

function CheckpointRow({ paths, onRollback }: { paths: string[]; onRollback: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="text-muted-foreground text-2xs flex h-6 items-center gap-2">
      <Icon.stash className="size-3 shrink-0 opacity-75" />
      <span>{t('agent.checkpoint')}</span>
      <span className="min-w-0 flex-1 truncate">{paths.join(', ')}</span>
      <Button variant="ghost" size="3xs" onClick={onRollback}>
        <Icon.back />
        {t('agent.rollback')}
      </Button>
    </div>
  );
}

export function SubagentCard({ title, items, done, id, repo }: Props & SubagentProps) {
  const { t } = useTranslation();
  return (
    <Collapsible className="border-border bg-card flex flex-col rounded-md border">
      <CollapsibleTrigger className="group flex h-7 items-center gap-2 px-2 text-xs">
        <span className={cn('size-1.5 shrink-0 rounded-full', transcriptDot(done))} />
        <Icon.chevron className="size-3 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
        <span className="min-w-0 flex-1 truncate text-left">{title}</span>
        <span className="text-muted-foreground text-2xs shrink-0 tabular-nums">
          {t('agent.subagentCalls', { count: callsInTranscript(items) })}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-border flex flex-col gap-2 border-t p-2">
        {items.map((item, at) => (
          <FeedRow key={keyOfItem(item, at)} item={item} id={id} repo={repo} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function FeedRow({ item, id, repo }: Props & { item: FeedItem }) {
  switch (item.kind) {
    case 'user':
      return (
        <div
          data-said-by="user"
          className="bg-fill-2 text-foreground flex items-start gap-1.5 rounded-md px-2 py-1 text-xs"
        >
          <span className="text-muted-foreground select-none">❯</span>
          <span className="min-w-0 flex-1 font-medium whitespace-pre-wrap">{item.text}</span>
        </div>
      );
    case 'agent':
      return (
        <p data-said-by="agent" className="px-2 text-xs leading-5 whitespace-pre-wrap">
          {item.text}
        </p>
      );
    case 'thought':
      return (
        <p
          data-said-by="thought"
          className="text-muted-foreground px-2 text-xs leading-5 whitespace-pre-wrap"
        >
          {item.text}
        </p>
      );
    case 'tool':
      return (
        <ToolCard
          title={item.title}
          status={item.status}
          terminalId={item.terminalId}
          exit={item.exit}
        />
      );
    case 'subagent':
      return (
        <SubagentCard title={item.title} items={item.items} done={item.done} id={id} repo={repo} />
      );
    case 'plan':
      return <PlanList entries={item.entries} />;
    case 'permission':
      return (
        <PermissionCard
          title={item.title}
          options={item.options}
          resolved={item.resolved}
          onPick={(optionId) => answerPermission(id, item.requestId, optionId).catch(notifyError)}
        />
      );
    case 'checkpoint':
      return (
        <CheckpointRow
          paths={item.paths}
          onRollback={() =>
            rollbackCheckpoint(repo, { oid: item.oid, paths: item.paths }).catch(notifyError)
          }
        />
      );
    case 'ended':
      return <InlineNote>{item.reason}</InlineNote>;
  }
}

export function AgentFeed({ id, repo }: Props) {
  const items = useFeed(id);
  const status = useAgentSessions((state) => state.sessions.find((one) => one.id === id)?.status);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
      {items.map((item, at) => (
        <FeedRow key={keyOfItem(item, at)} item={item} id={id} repo={repo} />
      ))}
      {turnIsRunning(status) ? <TurnActivity stopping={status === 'stopping'} /> : null}
    </div>
  );
}
