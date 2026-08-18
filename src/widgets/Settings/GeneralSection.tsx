import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icons';

import * as ipc from '@/shared/api/ipc';
import { notifyError } from '@/shared/ui/toast';
import { usePref } from '@/shared/lib/prefs';
import { Checkbox } from '@/shared/ui/checkbox';
import { Input } from '@/shared/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { AUTOFETCH_LIMITS, clampAutofetch, SETTINGS } from '@/shared/config/settingsModel';
import { PULL_CHOICES, type PullMode } from '@/shared/config/vocabulary';

import { SettingRow } from './SettingRow';
export function GeneralSection() {
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
            <Button variant="outline" size="sm" className="w-72 justify-between font-normal">
              {t(chosenPull.label as 'pull.default')}
              <Icon.chevron className="size-3 rotate-90 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
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
