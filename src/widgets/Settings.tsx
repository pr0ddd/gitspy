import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/icons';
import { Hint } from '@/components/ui/tooltip';
import { NavItem, ViewBar } from '@/parts';
import { clampPanel, PANEL_LIMITS } from '@/resize';
import * as ipc from '@/ipc';
import { notifyError } from '@/toast';
import { usePref } from '@/prefs';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AUTOFETCH_LIMITS, clampAutofetch, SETTINGS } from '@/settingsModel';
import { PULL_CHOICES, type PullMode } from '@/vocabulary';
import type { AccountView, DeviceView } from '@/types';

const HOST = 'github';

type Props = {
  open: boolean;
  account: AccountView | null;
  collapsed: boolean;
  onToggle: () => void;
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
    <div className="grid grid-cols-[240px_1fr] items-start gap-x-8">
      <span className="flex min-h-8 items-center justify-end text-right text-sm leading-snug">
        {label}
      </span>
      <div className="flex min-w-0 flex-col justify-center gap-2 self-stretch">
        {children}
        {hint ? (
          <p className="text-muted-foreground max-w-xl text-xs leading-relaxed">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}

export function Settings({ open, account, collapsed, onToggle, onDisconnected }: Props) {
  const { t } = useTranslation();
  const [section, setSection] = usePref<SectionKey>('settings.section', 'general');
  const [width] = usePref<number>('sidebar.width', PANEL_LIMITS.sidebar.fallback);

  if (!open) return null;

  const chosen = SECTIONS.find((s) => s.key === section) ?? SECTIONS[0];

  return (
    <>
      {collapsed ? (
        <aside className="flex w-12 shrink-0 flex-col items-center gap-1">
          <NavItem icon="expand" hint={t('sidebar.expand')} hintSide="right" onClick={onToggle} />
          <span className="h-1" />
          {SECTIONS.map(({ key, label, icon }) => (
            <NavItem
              key={key}
              icon={icon}
              name={t(label as 'settings.general')}
              hint={t(label as 'settings.general')}
              hintSide="right"
              active={key === section}
              onClick={() => setSection(key)}
            />
          ))}
        </aside>
      ) : (
      <aside
        className="flex shrink-0 flex-col gap-0.5 px-2.5"
        style={{ width: clampPanel('sidebar', width) }}
      >
        <div className="flex items-center gap-1 pb-2">
          <span className="text-faint flex h-8 min-w-0 flex-1 items-center px-2 text-xs">
            {t('settings.title')}
          </span>
          <Hint text={t('sidebar.collapse')}>
            <Button
              variant="field"
              size="icon-sm"
              aria-label={t('sidebar.collapse')}
              onClick={onToggle}
            >
              <Icon.collapse className="size-4" />
            </Button>
          </Hint>
        </div>
        {SECTIONS.map(({ key, label, icon }) => (
          <NavItem
            key={key}
            icon={icon}
            label={t(label as 'settings.general')}
            active={key === section}
            onClick={() => setSection(key)}
          />
        ))}
      </aside>
      )}

      <div className="bg-card shadow-sheet relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border">
        <ViewBar>
          <Icon.settings className="text-muted-foreground size-3.5" />
          <span className="text-muted-foreground shrink-0">{t('settings.title')}</span>
          <span className="text-foreground truncate font-medium">
            {t(chosen.label as 'settings.general')}
          </span>
        </ViewBar>
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="max-w-3xl space-y-8 px-10 py-8">
            <h1 className="text-2xl font-semibold tracking-tight">
              {t(chosen.label as 'settings.general')}
            </h1>
            {section === 'general' ? (
              <GeneralSection />
            ) : (
              <GitHubSection account={account} onDisconnected={onDisconnected} />
            )}
          </div>
        </main>
      </div>
    </>
  );
}

function GeneralSection() {
  const { t } = useTranslation();
  const [minutes, setMinutes] = usePref<number>(
    SETTINGS.autofetchMinutes,
    AUTOFETCH_LIMITS.fallback,
  );
  const [remember, setRemember] = usePref<boolean>(SETTINGS.rememberTabs, true);
  const [pull, setPull] = usePref<PullMode>(SETTINGS.pullDefault, 'pull');
  const [branch, setBranch] = usePref<string>(SETTINGS.initBranch, '');

  const applyMinutes = (raw: string) => {
    const next = clampAutofetch(Number(raw));
    setMinutes(next);
    void ipc.setAutofetchMinutes(next).catch(notifyError);
  };

  const chosenPull = PULL_CHOICES.find((c) => c.mode === pull) ?? PULL_CHOICES[1];

  return (
    <div className="space-y-7">
      <SettingRow label={t('settings.autofetch')} hint={t('settings.autofetchHint')}>
        <Input
          type="number"
          min={AUTOFETCH_LIMITS.min}
          max={AUTOFETCH_LIMITS.max}
          value={minutes}
          onChange={(e) => applyMinutes(e.target.value)}
          className="h-8 w-72 text-sm"
          aria-label={t('settings.autofetch')}
        />
      </SettingRow>

      <SettingRow label={t('settings.rememberTabs')} hint={t('settings.rememberTabsHint')}>
        <Checkbox
          checked={remember}
          onCheckedChange={(next) => setRemember(next === true)}
          aria-label={t('settings.rememberTabs')}
        />
      </SettingRow>

      <SettingRow label={t('settings.pullDefault')} hint={t('settings.pullDefaultHint')}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="font-normal">
              {t(chosenPull.label as 'pull.default')}
              <Icon.chevron className="size-3 rotate-90 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuRadioGroup
              value={pull}
              onValueChange={(next) => setPull(next as PullMode)}
            >
              {PULL_CHOICES.map(({ mode, label }) => (
                <DropdownMenuRadioItem key={mode} value={mode}>
                  {t(label as 'pull.default')}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SettingRow>

      <SettingRow label={t('settings.initBranch')} hint={t('settings.initBranchHint')}>
        <Input
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          placeholder={t('settings.initBranchDefault')}
          className="h-8 w-72 text-sm"
          aria-label={t('settings.initBranch')}
        />
      </SettingRow>
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
