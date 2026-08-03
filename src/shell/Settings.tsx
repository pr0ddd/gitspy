import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Icon } from '../icons';
import * as ipc from '../ipc';
import { notifyError } from '../toast';
import type { AccountView, DeviceView } from '../types';

const HOST = 'github';

type Props = {
  open: boolean;
  account: AccountView | null;
  onOpenChange: (open: boolean) => void;
  onDisconnected: () => void;
};

export function Settings({ open, account, onOpenChange, onDisconnected }: Props) {
  const { t } = useTranslation();
  const [device, setDevice] = useState<DeviceView | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (account) setDevice(null);
  }, [account]);

  const connect = () => {
    setBusy(true);
    ipc
      .startConnect(HOST)
      .then(setDevice)
      .catch(notifyError)
      .finally(() => setBusy(false));
  };

  const disconnect = () => {
    setBusy(true);
    ipc
      .disconnectHost(HOST)
      .then(onDisconnected)
      .catch(notifyError)
      .finally(() => setBusy(false));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('settings.title')}</DialogTitle>
          <DialogDescription>{t('settings.integrationsHint')}</DialogDescription>
        </DialogHeader>

        <Separator />

        <section className="space-y-3">
          <h3 className="text-muted-foreground text-xs tracking-wide uppercase">GitHub</h3>

          {account ? (
            <div className="bg-surface-raised flex items-center gap-3 rounded-md p-3">
              <img
                src={account.avatarUrl}
                alt=""
                className="size-9 shrink-0 rounded-full"
                referrerPolicy="no-referrer"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{account.name ?? account.login}</div>
                <div className="text-muted-foreground truncate text-xs">
                  {account.login}
                </div>
              </div>
              <Button variant="outline" size="sm" disabled={busy} onClick={disconnect}>
                {t('settings.disconnect')}
              </Button>
            </div>
          ) : device ? (
            <DeviceCode device={device} />
          ) : (
            <div className="space-y-2">
              <Button size="sm" disabled={busy} onClick={connect}>
                <Icon.host className="size-3.5" />
                {t('settings.connect')}
              </Button>
              <p className="text-muted-foreground text-xs leading-relaxed">
                {t('settings.connectHint')}
              </p>
            </div>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}

function DeviceCode({ device }: { device: DeviceView }) {
  const { t } = useTranslation();

  return (
    <div className="bg-surface-raised space-y-3 rounded-md p-4 text-center">
      <p className="text-muted-foreground text-xs">{t('settings.codeHint')}</p>
      <div className="font-mono text-2xl font-semibold tracking-widest select-all">
        {device.userCode}
      </div>
      <div className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs">
        <Icon.waiting className="size-3 animate-spin" />
        {t('settings.waiting')}
      </div>
      <div className="text-muted-foreground text-xs break-all">
        {device.verificationUri}
      </div>
    </div>
  );
}
