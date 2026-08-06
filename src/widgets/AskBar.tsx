import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import type { Operation } from '@/types';

export type Ask =
  | { kind: 'branch' }
  | { kind: 'stash' }
  | { kind: 'branchAt'; hash: string }
  | { kind: 'tagAt'; hash: string }
  | { kind: 'annotatedTagAt'; hash: string }
  | { kind: 'renameBranch'; from: string }
  | { kind: 'editMessage'; full: string };

type Props = {
  ask: Ask | null;
  onOpenChange: (open: boolean) => void;
  onRun: (operation: Operation) => void;
};

const WORDING = {
  branch: { title: 'branch.title', field: 'branch.name', confirm: 'branch.create' },
  branchAt: { title: 'branch.title', field: 'branch.name', confirm: 'branch.create' },
  stash: { title: 'stash.title', field: 'stash.message', confirm: 'stash.create' },
  tagAt: { title: 'tag.title', field: 'tag.name', confirm: 'tag.create' },
  annotatedTagAt: { title: 'tag.annotatedTitle', field: 'tag.name', confirm: 'tag.create' },
  renameBranch: { title: 'rename.title', field: 'rename.name', confirm: 'rename.confirm' },
  editMessage: {
    title: 'editMessage.title',
    field: 'workingTree.messagePlaceholder',
    confirm: 'editMessage.confirm',
  },
} as const;

const operationOf = (
  ask: Ask,
  name: string,
  message: string,
  checkout: boolean,
): Operation => {
  switch (ask.kind) {
    case 'branch':
      return { kind: 'branch', name, checkout };
    case 'stash':
      return { kind: 'stash', message: name };
    case 'branchAt':
      return { kind: 'branchAt', name, hash: ask.hash };
    case 'tagAt':
      return { kind: 'tagAt', name, hash: ask.hash };
    case 'annotatedTagAt':
      return { kind: 'annotatedTagAt', name, message, hash: ask.hash };
    case 'renameBranch':
      return { kind: 'branchRename', from: ask.from, to: name };
    case 'editMessage':
      return { kind: 'amendMessage', message: name };
  }
};

export function AskBar({ ask, onOpenChange, onRun }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [checkout, setCheckout] = useState(true);

  useEffect(() => {
    if (!ask) return;
    setName(
      ask.kind === 'renameBranch' ? ask.from : ask.kind === 'editMessage' ? ask.full : '',
    );
    setMessage('');
  }, [ask]);

  if (!ask) return null;

  const wording = WORDING[ask.kind];
  const needsMessage = ask.kind === 'annotatedTagAt';
  const multiline = ask.kind === 'editMessage';
  const ready =
    ask.kind === 'stash'
      ? true
      : name.trim().length > 0 && (!needsMessage || message.trim().length > 0);

  const cancel = () => onOpenChange(false);

  const run = () => {
    if (!ready) return;
    onRun(operationOf(ask, name.trim(), message.trim(), checkout));
    onOpenChange(false);
  };

  const submitKeys = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') cancel();
    if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) run();
  };

  return (
    <div className="bg-card animate-in fade-in slide-in-from-top-2 shadow-sheet absolute inset-x-0 top-0 z-30 duration-150">
      <div className="bg-primary/15 min-h-bar flex items-center justify-center gap-3 border-b px-4 py-2">
      <span className="shrink-0 text-sm">{t(wording.title as 'branch.title')}</span>

      {multiline ? (
        <textarea
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={submitKeys}
          rows={2}
          className="bg-fill-1 text-foreground focus:bg-fill-2 w-96 resize-none rounded-md px-2.5 py-1.5 text-sm outline-none"
        />
      ) : (
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={submitKeys}
          placeholder={t(wording.field as 'branch.name')}
          className="h-7 w-64 text-xs"
        />
      )}

      {needsMessage ? (
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={submitKeys}
          placeholder={t('tag.message')}
          className="h-7 w-64 text-xs"
        />
      ) : null}

      {ask.kind === 'branch' ? (
        <label className="flex shrink-0 items-center gap-2 text-xs">
          <Checkbox checked={checkout} onCheckedChange={(next) => setCheckout(next === true)} />
          {t('branch.checkout')}
        </label>
      ) : null}

      <Button size="xs" disabled={!ready} onClick={run}>
        {t(wording.confirm as 'branch.create')}
      </Button>
      <Button size="xs" variant="secondary" onClick={cancel}>
        {t('ask.cancel')}
      </Button>
      </div>
    </div>
  );
}
