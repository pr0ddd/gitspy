import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { open as pickDirectory } from '@tauri-apps/plugin-dialog';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Icon, type IconName } from '@/icons';
import * as ipc from '@/ipc';
import { NavItem } from '@/parts';
import { directoryFromUrl } from '@/paths';
import { notifyError } from '@/toast';
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

const TABS: ReadonlyArray<{ key: string; label: string; icon: IconName }> = [
  { key: 'url', label: 'repoDialog.withUrl', icon: 'web' },
];

type Props = {
  open: boolean;
  url: string;
  onOpenChange: (open: boolean) => void;
  onCloned: (path: string) => void;
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] items-start gap-x-4">
      <span className="text-muted-foreground flex min-h-8 items-center justify-end text-right text-sm">
        {label}
      </span>
      <div className="flex min-h-8 min-w-0 items-center">{children}</div>
    </div>
  );
}

export function RepoDialog({ open, url, onOpenChange, onCloned }: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState('url');
  const [address, setAddress] = useState(url);
  const [parent, setParent] = useState('');
  const [name, setName] = useState(directoryFromUrl(url));
  const [shallow, setShallow] = useState(false);
  const [step, setStep] = useState<CloneStepView | null>(null);

  useEffect(() => {
    if (!open) return;
    setTab('url');
    setAddress(url);
    setName(directoryFromUrl(url));
    setShallow(false);
    setStep(null);
    ipc.defaultCloneDir().then(setParent).catch(notifyError);
  }, [open, url]);

  const running = step !== null;

  const start = () => {
    if (!address.trim() || !parent || !name.trim()) return;
    setStep({ stage: 'progress.counting', percent: 0, overall: 0 });
    ipc
      .cloneRepo(address.trim(), parent, name.trim(), shallow, setStep)
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
      <DialogContent className="flex h-104 max-w-3xl gap-0 overflow-hidden p-0">
        <aside className="bg-fill-1 flex w-52 shrink-0 flex-col gap-px border-r p-2">
          {TABS.map((entry) => (
            <NavItem
              key={entry.key}
              icon={entry.icon}
              label={t(entry.label as 'repoDialog.withUrl')}
              active={tab === entry.key}
              onClick={() => setTab(entry.key)}
            />
          ))}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-5 p-6">
          <DialogTitle className="text-base font-semibold">{GIT.clone}</DialogTitle>

          <div className="space-y-4">
            <Row label={t('repoDialog.where')}>
              <div className="flex w-full gap-2">
                <Input
                  value={parent}
                  onChange={(e) => setParent(e.target.value)}
                  disabled={running}
                  className="h-8 min-w-0 flex-1 text-xs"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={browse}
                  disabled={running}
                  className="shrink-0"
                >
                  {t('clone.browse')}
                </Button>
              </div>
            </Row>

            <Row label="URL">
              <Input
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  setName(directoryFromUrl(e.target.value));
                }}
                onKeyDown={(e) => e.key === 'Enter' && start()}
                placeholder="https://github.com/owner/repo.git"
                disabled={running}
                className="h-8 text-xs"
              />
            </Row>

            <Row label={t('repoDialog.fullPath')}>
              <div className="flex w-full min-w-0 items-center gap-1.5">
                <span className="text-muted-foreground shrink truncate font-mono text-xs">
                  {parent}/
                </span>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={running}
                  placeholder={t('clone.directory')}
                  className="h-8 w-56 text-xs"
                />
              </div>
            </Row>

            <Row label={t('repoDialog.shallow')}>
              <Checkbox
                checked={shallow}
                onCheckedChange={(next) => setShallow(next === true)}
                disabled={running}
                aria-label={t('repoDialog.shallow')}
              />
            </Row>
          </div>

          <div className="mt-auto">
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
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
