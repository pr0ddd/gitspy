import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/ui/button';
import { Icon, type IconName } from '@/shared/ui/icons';
import * as ipc from '@/shared/api/ipc';
import { notifyError } from '@/shared/ui/toast';
import type { ConnectStartView } from '@/shared/api/types';
import { disconnectHost, useHostAccount, useHostRejected } from '@/features/hosts';

export function HostCard({ host }: { host: { id: string; label: string; icon: IconName } }) {
  const { t } = useTranslation();
  const account = useHostAccount(host.id);
  const rejected = useHostRejected(host.id);
  const [started, setStarted] = useState<ConnectStartView | null>(null);
  const [busy, setBusy] = useState(false);
  const Glyph = Icon[host.icon];

  useEffect(() => {
    if (account) setStarted(null);
  }, [account]);

  useEffect(() => {
    const failed = ipc.onHostFailed(() => setStarted(null));
    return () => {
      void failed.then((off) => off());
    };
  }, []);

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
    disconnectHost(host.id)
      .catch(notifyError)
      .finally(() => setBusy(false));
  };

  return (
    <>
      {account && !rejected ? (
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
        <div className="space-y-2">
          {rejected ? (
            <p className="text-deleted text-xs">
              {t('settings.rejectedHint', { host: host.label, login: account?.login ?? '' })}
            </p>
          ) : null}
          <Button size="sm" disabled={busy} onClick={connect}>
            <Glyph className="size-3.5" />
            {t(rejected ? 'settings.reconnect' : 'settings.connect', { host: host.label })}
          </Button>
          {rejected ? null : (
            <p className="text-muted-foreground text-xs">{t('settings.connectHint')}</p>
          )}
        </div>
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
