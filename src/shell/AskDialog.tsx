import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { Operation } from '../types';

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

export function AskDialog({ ask, onOpenChange, onRun }: Props) {
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

  const wording = WORDING[ask?.kind ?? 'branch'];
  const needsMessage = ask?.kind === 'annotatedTagAt';
  const multiline = ask?.kind === 'editMessage';
  const ready =
    ask?.kind === 'stash'
      ? true
      : name.trim().length > 0 && (!needsMessage || message.trim().length > 0);

  const run = () => {
    if (!ask || !ready) return;
    onRun(operationOf(ask, name.trim(), message.trim(), checkout));
    onOpenChange(false);
  };

  return (
    <Dialog open={ask !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t(wording.title as 'branch.title')}</DialogTitle>
        </DialogHeader>

        {multiline ? (
          <textarea
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && run()}
            rows={4}
            className="bg-fill-1 text-foreground focus:bg-fill-2 w-full resize-none rounded-md px-2.5 py-1.5 text-sm outline-none"
          />
        ) : (
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
            placeholder={t(wording.field as 'branch.name')}
          />
        )}

        {needsMessage ? (
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
            placeholder={t('tag.message')}
          />
        ) : null}

        {ask?.kind === 'branch' ? (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={checkout} onCheckedChange={(next) => setCheckout(next === true)} />
            {t('branch.checkout')}
          </label>
        ) : null}

        <DialogFooter>
          <Button size="sm" disabled={!ready} onClick={run}>
            {t(wording.confirm as 'branch.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
