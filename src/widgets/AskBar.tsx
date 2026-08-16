import type { Ask } from '@/features/menus';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { cn } from '@/shared/lib/utils';
import type { Operation } from '@/shared/api/types';

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

const operationOf = (ask: Ask, name: string, message: string, checkout: boolean): Operation => {
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
    setName(ask.kind === 'renameBranch' ? ask.from : ask.kind === 'editMessage' ? ask.full : '');
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
    <div
      className={cn(
        'bg-primary/15 animate-in fade-in flex shrink-0 items-center justify-center gap-3 px-4 duration-150',
        multiline ? 'min-h-12 py-1' : 'h-12',
      )}
    >
      <span className="shrink-0 text-sm">{t(wording.title as 'branch.title')}</span>

      {multiline ? (
        <Textarea
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={submitKeys}
          rows={2}
          className="w-96"
        />
      ) : (
        <Input
          size="sm"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={submitKeys}
          placeholder={t(wording.field as 'branch.name')}
          className="w-64"
        />
      )}

      {needsMessage ? (
        <Input
          size="sm"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={submitKeys}
          placeholder={t('tag.message')}
          className="w-64"
        />
      ) : null}

      {ask.kind === 'branch' ? (
        <label className="flex shrink-0 items-center gap-2 text-xs">
          <Checkbox checked={checkout} onCheckedChange={(next) => setCheckout(next === true)} />
          {t('branch.checkout')}
        </label>
      ) : null}

      <Button size="sm" disabled={!ready} onClick={run}>
        {t(wording.confirm as 'branch.create')}
      </Button>
      <Button size="sm" variant="secondary" onClick={cancel}>
        {t('ask.cancel')}
      </Button>
    </div>
  );
}

export type { Ask };
