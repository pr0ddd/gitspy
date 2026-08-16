import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/ui/button';
import { Icon, type IconName } from '@/shared/ui/icons';
import * as ipc from '@/shared/api/ipc';
import { notifyError } from '@/shared/ui/toast';
import type { AccountView, ConnectStartView } from '@/shared/api/types';
import { HOST_LABEL } from '@/entities/repo';

export const HOSTS: ReadonlyArray<{ id: string; label: string; icon: IconName }> = [
  { id: 'github', label: HOST_LABEL.github, icon: 'github' },
  { id: 'gitlab', label: HOST_LABEL.gitlab, icon: 'gitlab' },
  { id: 'bitbucket', label: HOST_LABEL.bitbucket, icon: 'bitbucket' },
];

export function HostCard({
  host,
  seeded,
  onDisconnected,
}: {
  host: { id: string; label: string; icon: IconName };
  seeded: AccountView | null;
  onDisconnected: () => void;
}) {
  const { t } = useTranslation();
  const [account, setAccount] = useState<AccountView | null>(seeded);
  const [started, setStarted] = useState<ConnectStartView | null>(null);
  const [busy, setBusy] = useState(false);
  const Glyph = Icon[host.icon];

  useEffect(() => {
    let alive = true;
    ipc
      .hostAccount(host.id)
      .then((found) => alive && found && setAccount(found))
      .catch(() => undefined);
    const stop = ipc.onHostConnected((fresh) => {
      if (fresh.host === host.id) {
        setAccount(fresh);
        setStarted(null);
      }
    });
    const failed = ipc.onHostFailed(() => setStarted(null));
    return () => {
      alive = false;
      void stop.then((off) => off());
      void failed.then((off) => off());
    };
  }, [host.id]);

  const connect = () => {
    setBusy(true);
    ipc
      .startConnect(host.id)
      .then(setStarted)
      .catch(notifyError)
      .finally(() => setBusy(false));
  };

  const disconnect = () => {
    setBusy(true);
    ipc
      .disconnectHost(host.id)
      .then(() => {
        setAccount(null);
        onDisconnected();
      })
      .catch(notifyError)
      .finally(() => setBusy(false));
  };

  return (
    <>
      {account ? (
        <div className="bg-fill-1 flex w-full max-w-xl items-center gap-3 rounded-md p-3">
          <img
            src={account.avatarUrl}
            alt=""
            className="size-9 shrink-0 rounded-full"
            referrerPolicy="no-referrer"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{account.name ?? account.login}</div>
            <div className="text-muted-foreground truncate text-xs">{account.login}</div>
          </div>
          <Button variant="outline" size="sm" disabled={busy} onClick={disconnect}>
            {t('settings.disconnect')}
          </Button>
        </div>
      ) : started ? (
        <ConnectPending started={started} />
      ) : (
        <Button size="sm" disabled={busy} onClick={connect}>
          <Glyph className="size-3.5" />
          {t('settings.connect', { host: host.label })}
        </Button>
      )}
    </>
  );
}

function ConnectPending({ started }: { started: ConnectStartView }) {
  const { t } = useTranslation();
  if (started.kind !== 'browserAuth') return null;
  return (
    <div className="bg-fill-1 flex max-w-xl items-center gap-2.5 rounded-md p-4 text-xs">
      <Icon.waiting className="size-3 shrink-0 animate-spin" />
      <span className="text-muted-foreground">{t('settings.browserWaiting')}</span>
    </div>
  );
}
