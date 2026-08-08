import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { draftOf, onDraft, setDraft, turnIsRunning, useAgentSessions } from '@/entities/agent';
import { sendPrompt, stopTurn } from '@/features/agent';
import { Icon } from '@/icons';
import { AgentChips } from './AgentChips';
import { ListRow } from '@/parts';
import { notifyError } from '@/toast';
import type { AcpCommandView } from '@/types';

type Props = {
  id: number;
  repo: string;
};

const NO_COMMANDS: AcpCommandView[] = [];

const typedCommandPrefix = (draft: string): string | null => {
  if (!draft.startsWith('/')) return null;
  const typed = draft.slice(1);
  return /\s/.test(typed) ? null : typed;
};

const commandsMatchingPrefix = (
  commands: AcpCommandView[],
  prefix: string | null,
): AcpCommandView[] =>
  prefix === null ? NO_COMMANDS : commands.filter((one) => one.name.includes(prefix));

const wrappedAround = (at: number, step: number, length: number): number =>
  length === 0 ? 0 : (at + step + length) % length;

function CommandList({
  commands,
  highlighted,
  onPick,
  onHighlight,
}: {
  commands: AcpCommandView[];
  highlighted: number;
  onPick: (command: AcpCommandView) => void;
  onHighlight: (at: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="listbox"
      aria-label={t('agent.commands')}
      className="border-border bg-popover absolute bottom-full left-0 z-20 mb-1 flex max-h-64 w-full flex-col overflow-y-auto rounded-md border p-1 shadow-md"
    >
      {commands.map((command, at) => (
        <div
          key={command.name}
          role="option"
          aria-selected={at === highlighted}
          className="shrink-0"
          onMouseEnter={() => onHighlight(at)}
        >
          <ListRow as="div" current={at === highlighted} onClick={() => onPick(command)}>
            <span className="shrink-0">{command.name}</span>
            <span className="text-muted-foreground min-w-0 flex-1 truncate">
              {command.description}
            </span>
          </ListRow>
        </div>
      ))}
    </div>
  );
}

export function AgentComposer({ id, repo }: Props) {
  const { t } = useTranslation();
  const draft = useSyncExternalStore(
    useCallback((changed: () => void) => onDraft(id, changed), [id]),
    useCallback(() => draftOf(id), [id]),
  );
  const [highlighted, setHighlighted] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const session = useAgentSessions((state) => state.sessions.find((one) => one.id === id));
  const running = turnIsRunning(session?.status);

  const offered = commandsMatchingPrefix(
    session?.commands ?? NO_COMMANDS,
    typedCommandPrefix(draft),
  );
  const listing = !dismissed && offered.length > 0;

  const retype = (text: string) => {
    setDraft(id, text);
    setHighlighted(0);
    setDismissed(false);
  };

  const putCommandInDraft = (command: AcpCommandView) => {
    retype(`/${command.name} `);
    field.current?.focus();
  };

  const send = () => {
    const text = draft.trim();
    if (!text || running) return;
    retype('');
    sendPrompt(id, text).catch(notifyError);
  };

  const walkListOrSend = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (listing && event.key === 'Escape') {
      event.preventDefault();
      setDismissed(true);
      return;
    }
    if (listing && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      setHighlighted(
        wrappedAround(highlighted, event.key === 'ArrowDown' ? 1 : -1, offered.length),
      );
      return;
    }
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    const picked = offered[highlighted];
    if (listing && picked) putCommandInDraft(picked);
    else send();
  };

  return (
    <div className="flex shrink-0 flex-col gap-1 p-2">
      <div className="relative flex items-center gap-1.5">
        {listing ? (
          <CommandList
            commands={offered}
            highlighted={highlighted}
            onPick={putCommandInDraft}
            onHighlight={setHighlighted}
          />
        ) : null}
        <Input
          ref={field}
          size="sm"
          value={draft}
          placeholder={t('agent.placeholder')}
          onChange={(event) => retype(event.target.value)}
          onKeyDown={walkListOrSend}
        />
        {running ? (
          <Button
            variant="action"
            size="sm"
            aria-label={t('agent.stop')}
            onClick={() => stopTurn(id).catch(notifyError)}
          >
            <Icon.stop />
            {t('agent.stop')}
          </Button>
        ) : (
          <Button
            variant="action"
            size="sm"
            aria-label={t('agent.send')}
            disabled={draft.trim().length === 0}
            onClick={send}
          >
            <Icon.up />
            {t('agent.send')}
          </Button>
        )}
      </div>
      <AgentChips id={id} repo={repo} />
    </div>
  );
}
