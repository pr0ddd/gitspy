import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { open as pickDirectory } from '@tauri-apps/plugin-dialog';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Icon } from '@/icons';
import * as ipc from '@/ipc';
import { notifyError } from '@/toast';
import { directoryFromUrl } from '@/paths';
import { GIT } from '@/vocabulary';
import type { CloneStepView } from '@/types';

const STAGES = [
  'progress.counting',
  'progress.compressing',
  'progress.writing',
  'progress.receiving',
  'progress.resolving',
  'progress.updating',
] as const;

const knownStage = (stage: string) => STAGES.find((known) => known === stage);

type Props = {
  open: boolean;
  url: string;
  onOpenChange: (open: boolean) => void;
  onCloned: (path: string) => void;
};

export function CloneDialog({ open, url, onOpenChange, onCloned }: Props) {
  const { t } = useTranslation();
  const [address, setAddress] = useState(url);
  const [parent, setParent] = useState('');
  const [name, setName] = useState(directoryFromUrl(url));
  const [step, setStep] = useState<CloneStepView | null>(null);

  useEffect(() => {
    if (!open) return;
    setAddress(url);
    setName(directoryFromUrl(url));
    setStep(null);
    ipc.defaultCloneDir().then(setParent).catch(notifyError);
  }, [open, url]);

  const running = step !== null;

  const start = () => {
    if (!address.trim() || !parent || !name.trim()) return;
    setStep({ stage: 'progress.counting', percent: 0, overall: 0 });
    ipc
      .cloneRepo(address.trim(), parent, name.trim(), setStep)
      .then((path) => {
        onOpenChange(false);
        onCloned(path);
      })
      .catch(notifyError)
      .finally(() => setStep(null));
  };

  const browse = () => {
    pickDirectory({ directory: true, defaultPath: parent })
      .then((chosen) => typeof chosen === 'string' && setParent(chosen))
      .catch(notifyError);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !running && onOpenChange(next)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{GIT.clone}</DialogTitle>
          <DialogDescription>{t('clone.hint')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              setName(directoryFromUrl(e.target.value));
            }}
            onKeyDown={(e) => e.key === 'Enter' && start()}
            placeholder="https://github.com/owner/repo.git"
            disabled={running}
            className="text-xs"
          />

          <div className="flex gap-2">
            <Input
              value={parent}
              onChange={(e) => setParent(e.target.value)}
              disabled={running}
              className="min-w-0 flex-1 text-xs"
            />
            <Button variant="secondary" onClick={browse} disabled={running} className="shrink-0">
              <Icon.open className="size-3.5" />
              {t('clone.browse')}
            </Button>
          </div>

          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={running}
            placeholder={t('clone.directory')}
            className="text-xs"
          />
        </div>

        {step ? (
          <div className="space-y-2">
            <Progress value={step.overall} />
            <div className="text-muted-foreground flex justify-between text-xs">
              <span>{knownStage(step.stage) ? t(knownStage(step.stage)!) : ''}</span>
              <span className="tabular-nums">{step.overall}%</span>
            </div>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button onClick={start} disabled={!address.trim() || !name.trim()}>
              <Icon.clone className="size-3.5" />
              {GIT.clone}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
