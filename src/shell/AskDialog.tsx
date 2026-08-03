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

export type Ask = 'branch' | 'stash';

type Props = {
  ask: Ask | null;
  onOpenChange: (open: boolean) => void;
  onRun: (operation: Operation) => void;
};

export function AskDialog({ ask, onOpenChange, onRun }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [checkout, setCheckout] = useState(true);

  useEffect(() => {
    if (ask) setName('');
  }, [ask]);

  const branch = ask === 'branch';
  const ready = branch ? name.trim().length > 0 : true;

  const run = () => {
    if (!ready) return;
    onRun(
      branch
        ? { kind: 'branch', name: name.trim(), checkout }
        : { kind: 'stash', message: name.trim() },
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={ask !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{branch ? t('branch.title') : t('stash.title')}</DialogTitle>
        </DialogHeader>

        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
          placeholder={branch ? t('branch.name') : t('stash.message')}
        />

        {branch ? (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={checkout} onCheckedChange={(next) => setCheckout(next === true)} />
            {t('branch.checkout')}
          </label>
        ) : null}

        <DialogFooter>
          <Button size="sm" disabled={!ready} onClick={run}>
            {branch ? t('branch.create') : t('stash.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
