import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icons';

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
import {
  clampFontSize,
  clampTabSize,
  FONT_SIZE_LIMITS,
  monospaceChoices,
  SETTINGS,
  TAB_SIZE_LIMITS,
} from '@/shared/config/settingsModel';
import { SettingRow } from './SettingRow';
const installedFonts = (): string[] =>
  typeof document !== 'undefined' && document.fonts
    ? monospaceChoices((family) => document.fonts.check(`12px '${family}'`))
    : [];

export function EditorSection() {
  const { t } = useTranslation();
  const [font, setFont] = usePref<string>(SETTINGS.editorFont, '');
  const [fontSize, setFontSize] = usePref<number>(
    SETTINGS.editorFontSize,
    FONT_SIZE_LIMITS.fallback,
  );
  const [tabSize, setTabSize] = usePref<number>(SETTINGS.editorTabSize, TAB_SIZE_LIMITS.fallback);
  const [syntax, setSyntax] = usePref<boolean>(SETTINGS.editorSyntax, true);
  const [lineNumbers, setLineNumbers] = usePref<boolean>(SETTINGS.editorLineNumbers, true);
  const [wrap, setWrap] = usePref<boolean>('diff.wrap', false);
  const [fonts] = useState(installedFonts);

  return (
    <div className="space-y-7">
      <SettingRow label={t('settings.editorFont')} hint={t('settings.editorFontHint')}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="w-72 justify-between font-normal">
              <span className="truncate font-mono">{font || t('settings.editorFontDefault')}</span>
              <Icon.chevron className="size-3 rotate-90 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuRadioGroup value={font} onValueChange={setFont}>
              <DropdownMenuRadioItem value="">
                {t('settings.editorFontDefault')}
              </DropdownMenuRadioItem>
              {fonts.map((family) => (
                <DropdownMenuRadioItem
                  key={family}
                  value={family}
                  style={{ fontFamily: `'${family}', monospace` }}
                >
                  {family}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SettingRow>

      <SettingRow label={t('settings.editorFontSize')}>
        <Input
          type="number"
          min={FONT_SIZE_LIMITS.min}
          max={FONT_SIZE_LIMITS.max}
          value={fontSize}
          onChange={(e) => setFontSize(clampFontSize(Number(e.target.value)))}
          className="h-8 w-72 text-sm"
          aria-label={t('settings.editorFontSize')}
        />
      </SettingRow>

      <SettingRow label={t('settings.editorTabSize')}>
        <Input
          type="number"
          min={TAB_SIZE_LIMITS.min}
          max={TAB_SIZE_LIMITS.max}
          value={tabSize}
          onChange={(e) => setTabSize(clampTabSize(Number(e.target.value)))}
          className="h-8 w-72 text-sm"
          aria-label={t('settings.editorTabSize')}
        />
      </SettingRow>

      <SettingRow label={t('settings.editorSyntax')}>
        <Checkbox
          checked={syntax}
          onCheckedChange={(next) => setSyntax(next === true)}
          aria-label={t('settings.editorSyntax')}
        />
      </SettingRow>

      <SettingRow label={t('settings.editorLineNumbers')}>
        <Checkbox
          checked={lineNumbers}
          onCheckedChange={(next) => setLineNumbers(next === true)}
          aria-label={t('settings.editorLineNumbers')}
        />
      </SettingRow>

      <SettingRow label={t('settings.editorWrap')} hint={t('settings.editorWrapHint')}>
        <Checkbox
          checked={wrap}
          onCheckedChange={(next) => setWrap(next === true)}
          aria-label={t('settings.editorWrap')}
        />
      </SettingRow>
    </div>
  );
}
