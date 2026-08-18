import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icons';

import { usePref } from '@/shared/lib/prefs';
import { Checkbox } from '@/shared/ui/checkbox';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { GRAPH_MINIMAP_DEFAULT, SETTINGS } from '@/shared/config/settingsModel';

import { APPEARANCES, useAppearance } from '@/shared/config/appearance';
import { ZOOM_STEPS, zoomLabel } from '@/shared/lib/zoom';
import { onApple, primaryModifier } from '@/shared/lib/keys';
import {
  DEFAULT_HIDDEN,
  HIDEABLE,
  loadHidden,
  saveHidden,
  saveWidths,
  type DescriptionMode,
  type HideableColumn,
} from '@/entities/graph';

import { SettingRow } from './SettingRow';
export function InterfaceSection({
  zoom,
  onZoom,
  compact,
  onCompact,
}: {
  zoom: number;
  onZoom: (zoom: number) => void;
  compact: boolean;
  onCompact: (compact: boolean) => void;
}) {
  const { t } = useTranslation();
  const [appearance, setAppearance] = useAppearance();
  const [minimap, setMinimap] = usePref<boolean>(SETTINGS.graphMinimap, GRAPH_MINIMAP_DEFAULT);
  const [description, setDescription] = usePref<DescriptionMode>('graph.description', 'always');
  const [hidden, setHidden] = useState<ReadonlySet<HideableColumn>>(loadHidden);

  const flipColumn = (key: HideableColumn) => {
    const next = new Set(hidden);
    if (!next.delete(key)) next.add(key);
    saveHidden(next);
    setHidden(next);
  };

  const resetColumns = () => {
    saveWidths({});
    const defaults = new Set(DEFAULT_HIDDEN);
    saveHidden(defaults);
    setHidden(defaults);
    onCompact(false);
  };

  return (
    <div className="space-y-7">
      <SettingRow label={t('settings.theme')} hint={t('settings.themeHint')}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="w-72 justify-between font-normal">
              {t(
                (APPEARANCES.find((entry) => entry.key === appearance)?.label ??
                  'appearance.gitspy') as 'appearance.gitspy',
              )}
              <Icon.chevron className="size-3 rotate-90 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuRadioGroup value={appearance} onValueChange={setAppearance}>
              {APPEARANCES.map((entry) => (
                <DropdownMenuRadioItem key={entry.key} value={entry.key}>
                  {t(entry.label as 'appearance.gitspy')}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SettingRow>

      <SettingRow
        label={t('settings.zoom')}
        hint={t('settings.zoomHint', { modifier: primaryModifier(onApple()) })}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="w-72 justify-between font-normal">
              {zoomLabel(zoom)}
              <Icon.chevron className="size-3 rotate-90 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuRadioGroup
              value={String(zoom)}
              onValueChange={(next) => onZoom(Number(next))}
            >
              {[...ZOOM_STEPS].reverse().map((step) => (
                <DropdownMenuRadioItem key={step} value={String(step)} className="tabular-nums">
                  {zoomLabel(step)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SettingRow>

      <SettingRow label={t('settings.compact')} hint={t('settings.compactHint')}>
        <Checkbox
          checked={compact}
          onCheckedChange={(next) => onCompact(next === true)}
          aria-label={t('settings.compact')}
        />
      </SettingRow>

      <SettingRow label={t('settings.description')} hint={t('settings.descriptionHint')}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="w-72 justify-between font-normal">
              {t(`settings.description_${description}` as 'settings.description_always')}
              <Icon.chevron className="size-3 rotate-90 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuRadioGroup
              value={description}
              onValueChange={(next) => setDescription(next as DescriptionMode)}
            >
              {(['always', 'hover', 'never'] as const).map((mode) => (
                <DropdownMenuRadioItem key={mode} value={mode}>
                  {t(`settings.description_${mode}` as 'settings.description_always')}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SettingRow>

      <SettingRow label={t('settings.minimap')} hint={t('settings.minimapHint')}>
        <Checkbox
          checked={minimap}
          onCheckedChange={(next) => setMinimap(next === true)}
          aria-label={t('settings.minimap')}
        />
      </SettingRow>

      <SettingRow label={t('settings.columns')} hint={t('settings.columnsHint')}>
        <div className="flex flex-col gap-2.5">
          {HIDEABLE.map((key) => (
            <label key={key} className="flex items-center gap-2.5 text-sm">
              <Checkbox
                checked={!hidden.has(key)}
                onCheckedChange={() => flipColumn(key)}
                aria-label={t(`column.${key}` as 'column.author')}
              />
              {t(`column.${key}` as 'column.author')}
            </label>
          ))}
        </div>
      </SettingRow>

      <SettingRow label={t('settings.resetColumns')} hint={t('settings.resetColumnsHint')}>
        <Button variant="outline" size="sm" onClick={resetColumns}>
          {t('menu.resetColumns')}
        </Button>
      </SettingRow>
    </div>
  );
}
