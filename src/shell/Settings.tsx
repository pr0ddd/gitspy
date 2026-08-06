import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Icon, type IconName } from '../icons';
import * as ipc from '../ipc';
import { notifyError } from '../toast';
import { usePref } from '../prefs';
import type { AccountView, DeviceView } from '../types';

const HOST = 'github';

type Props = {
  open: boolean;
  account: AccountView | null;
  onDisconnected: () => void;
};

type SectionKey = 'general' | 'integrations';

const SECTIONS: ReadonlyArray<{ key: SectionKey; label: string; icon: IconName }> = [
  { key: 'general', label: 'settings.general', icon: 'settings' },
  { key: 'integrations', label: 'settings.integrations', icon: 'host' },
];

export function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[220px_1fr] items-start gap-x-6">
      <span className="text-muted-foreground pt-1 text-right text-sm leading-snug">{label}</span>
      <div className="min-w-0 space-y-1.5">
        {children}
        {hint ? <p className="text-faint text-xs leading-relaxed">{hint}</p> : null}
      </div>
    </div>
  );
}

export function Settings({ open, account, onDisconnected }: Props) {
  const { t } = useTranslation();
  const [section, setSection] = usePref<SectionKey>('settings.section', 'general');

  if (!open) return null;

  return (
    <div className="flex min-w-0 flex-1 pl-2">
      <div className="bg-card shadow-sheet relative flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border">
      <aside className="border-border flex w-56 shrink-0 flex-col border-r py-3">
        <span className="text-faint px-4 pb-2 text-xs">{t('settings.title')}</span>
        {SECTIONS.map(({ key, label, icon }) => {
          const Glyph = Icon[icon];
          return (
            <button
              key={key}
              onClick={() => setSection(key)}
              className={cn(
                'mx-2 flex h-8 items-center gap-2.5 rounded-md px-2 text-sm transition-colors',
                key === section
                  ? 'bg-fill-2 text-foreground font-medium'
                  : 'text-muted-foreground hover:bg-fill-1 hover:text-foreground',
              )}
            >
              <Glyph className="size-4 opacity-75" />
              {t(label as 'settings.general')}
            </button>
          );
        })}
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-6 px-8 py-10">
          {section === 'general' ? (
            <p className="text-muted-foreground text-sm">{t('settings.nothingYet')}</p>
          ) : (
            <GitHubSection
              account={account}
              onDisconnected={onDisconnected}
            />
          )}
        </div>
      </main>
      </div>
    </div>
  );
}

function GitHubSection({
  account,
  onDisconnected,
}: {
  account: AccountView | null;
  onDisconnected: () => void;
}) {
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
    <SettingRow label="GitHub" hint={account ? undefined : t('settings.connectHint')}>
      {account ? (
        <div className="bg-fill-1 flex items-center gap-3 rounded-md p-3">
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
      ) : device ? (
        <DeviceCode device={device} />
      ) : (
        <Button size="sm" disabled={busy} onClick={connect}>
          <Icon.host className="size-3.5" />
          {t('settings.connect')}
        </Button>
      )}
    </SettingRow>
  );
}

function DeviceCode({ device }: { device: DeviceView }) {
  const { t } = useTranslation();

  return (
    <div className="bg-fill-1 space-y-3 rounded-md p-4 text-center">
      <p className="text-muted-foreground text-xs">{t('settings.codeHint')}</p>
      <div className="font-mono text-2xl font-semibold tracking-widest select-all">
        {device.userCode}
      </div>
      <div className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs">
        <Icon.waiting className="size-3 animate-spin" />
        {t('settings.waiting')}
      </div>
      <div className="text-muted-foreground text-xs break-all">{device.verificationUri}</div>
    </div>
  );
}
