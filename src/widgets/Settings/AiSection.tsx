import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icons';

import * as ipc from '@/shared/api/ipc';
import { notifyError } from '@/shared/ui/toast';
import { usePref } from '@/shared/lib/prefs';

import { Input } from '@/shared/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { AI_DEFAULT_URLS, AI_PROVIDERS, SETTINGS } from '@/shared/config/settingsModel';

import type { AiProviderId, AiServerView } from '@/shared/api/types';

import { SettingRow } from './SettingRow';
export function AiSection() {
  const { t } = useTranslation();
  const [provider, setProvider] = usePref<AiProviderId>(SETTINGS.aiProvider, 'ollama');
  const [baseUrl, setBaseUrl] = usePref<string>(SETTINGS.aiBaseUrl, '');
  const [model, setModel] = usePref<string>(SETTINGS.aiModel, '');
  const [models, setModels] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);
  const [detected, setDetected] = useState(false);

  const chosen = AI_PROVIDERS.find((p) => p.key === provider) ?? AI_PROVIDERS[0];

  const adopt = (server: AiServerView) => {
    setProvider(server.provider as AiProviderId);
    setModels(server.models);
    setDetected(true);
    if (!server.models.includes(model)) setModel(server.models[0] ?? '');
  };

  const check = async (quiet: boolean) => {
    const candidates = baseUrl.trim()
      ? [baseUrl.trim()]
      : [AI_DEFAULT_URLS.ollama, AI_DEFAULT_URLS.lmstudio];
    setChecking(true);
    try {
      for (let at = 0; at < candidates.length; at += 1) {
        try {
          adopt(await ipc.aiDetectServer(candidates[at]));
          return;
        } catch (error) {
          if (at === candidates.length - 1) throw error;
        }
      }
    } catch (error) {
      if (!quiet) notifyError(error);
    } finally {
      setChecking(false);
    }
  };

  const probeOnOpen = useRef(check);
  probeOnOpen.current = check;
  useEffect(() => {
    void probeOnOpen.current(true);
  }, []);

  return (
    <div className="space-y-7">
      <SettingRow
        label={t('settings.aiServer')}
        hint={
          detected
            ? t('settings.aiDetected', { provider: t(chosen.label as 'settings.aiOllama') })
            : t('settings.aiServerHint')
        }
      >
        <div className="flex w-full max-w-xl items-center gap-2">
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={AI_DEFAULT_URLS.ollama}
            className="min-w-0 flex-1"
          />
          <Button variant="outline" size="sm" disabled={checking} onClick={() => void check(false)}>
            {checking ? <Icon.waiting className="size-3.5 animate-spin" /> : null}
            {t('settings.aiCheck')}
          </Button>
        </div>
      </SettingRow>

      <SettingRow label={t('settings.aiModel')} hint={t('settings.aiModelHint')}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={models.length === 0 && !model}
              className="w-72 justify-between font-normal"
            >
              <span className="truncate">{model || t('settings.aiNoModel')}</span>
              {checking ? (
                <Icon.waiting className="size-3 animate-spin opacity-60" />
              ) : (
                <Icon.chevron className="size-3 rotate-90 opacity-60" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuRadioGroup value={model} onValueChange={setModel}>
              {models.map((name) => (
                <DropdownMenuRadioItem key={name} value={name}>
                  {name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SettingRow>
    </div>
  );
}
