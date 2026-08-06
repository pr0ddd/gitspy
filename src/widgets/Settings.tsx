import { useState } from 'react';
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
import {
  AI_DEFAULT_URLS,
  AI_PROVIDERS,
  AUTOFETCH_LIMITS,
  clampAutofetch,
  clampFontSize,
  clampTabSize,
  FONT_SIZE_LIMITS,
  monospaceChoices,
  SETTINGS,
  TAB_SIZE_LIMITS,
} from '@/settingsModel';
import { PULL_CHOICES, type PullMode } from '@/vocabulary';
import { APPEARANCES, useAppearance } from '@/appearance';
import { ZOOM_STEPS, zoomLabel } from '@/zoom';
import {
  DEFAULT_HIDDEN,
  HIDEABLE,
  loadHidden,
  saveHidden,
  saveWidths,
  type DescriptionMode,
  type HideableColumn,
} from '@/entities/graph';
import type { AccountView, AiProviderId } from '@/types';
import { HOSTS, HostCard } from '@/widgets/HostConnect';

type Props = {
  open: boolean;
  account: AccountView | null;
  collapsed: boolean;
  zoom: number;
  onZoom: (zoom: number) => void;
  compact: boolean;
  onCompact: (compact: boolean) => void;
  onToggle: () => void;
  onDisconnected: () => void;
};

type SectionKey = 'general' | 'interface' | 'editor' | 'integrations' | 'ai';

const SECTIONS: ReadonlyArray<{ key: SectionKey; label: string; icon: IconName }> = [
  { key: 'general', label: 'settings.general', icon: 'settings' },
  { key: 'interface', label: 'settings.interface', icon: 'appearance' },
  { key: 'editor', label: 'settings.editor', icon: 'edit' },
  { key: 'integrations', label: 'settings.integrations', icon: 'host' },
  { key: 'ai', label: 'settings.ai', icon: 'sparkle' },
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
      <div className="min-w-0 space-y-2">
        <div className="flex min-h-8 items-center">{children}</div>
        {hint ? (
          <p className="text-muted-foreground max-w-xl text-xs leading-relaxed">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}

export function Settings({
  open,
  account,
  collapsed,
  zoom,
  onZoom,
  compact,
  onCompact,
  onToggle,
  onDisconnected,
}: Props) {
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

      <div className="bg-card relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border">
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
            ) : section === 'interface' ? (
              <InterfaceSection
                zoom={zoom}
                onZoom={onZoom}
                compact={compact}
                onCompact={onCompact}
              />
            ) : section === 'editor' ? (
              <EditorSection />
            ) : section === 'ai' ? (
              <AiSection />
            ) : (
              <IntegrationsSection account={account} onDisconnected={onDisconnected} />
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

function InterfaceSection({
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
  const [minimap, setMinimap] = usePref<boolean>('graph.minimap', true);
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

      <SettingRow label={t('settings.zoom')} hint={t('settings.zoomHint')}>
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

const installedFonts = (): string[] =>
  typeof document !== 'undefined' && document.fonts
    ? monospaceChoices((family) => document.fonts.check(`12px '${family}'`))
    : [];

function AiSection() {
  const { t } = useTranslation();
  const [provider, setProvider] = usePref<AiProviderId>(SETTINGS.aiProvider, 'ollama');
  const [baseUrl, setBaseUrl] = usePref<string>(SETTINGS.aiBaseUrl, '');
  const [model, setModel] = usePref<string>(SETTINGS.aiModel, '');
  const [models, setModels] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);

  const url = baseUrl.trim() || AI_DEFAULT_URLS[provider];
  const chosen = AI_PROVIDERS.find((p) => p.key === provider) ?? AI_PROVIDERS[0];

  const pickProvider = (next: string) => {
    setProvider(next as AiProviderId);
    setModels([]);
    setModel('');
  };

  const check = () => {
    setChecking(true);
    ipc
      .aiListModels(provider, url)
      .then((found) => {
        setModels(found);
        if (!found.includes(model)) setModel(found[0] ?? '');
      })
      .catch(notifyError)
      .finally(() => setChecking(false));
  };

  return (
    <div className="space-y-7">
      <SettingRow label={t('settings.aiProvider')} hint={t('settings.aiProviderHint')}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="w-72 justify-between font-normal">
              {t(chosen.label as 'settings.aiOllama')}
              <Icon.chevron className="size-3 rotate-90 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuRadioGroup value={provider} onValueChange={pickProvider}>
              {AI_PROVIDERS.map((entry) => (
                <DropdownMenuRadioItem key={entry.key} value={entry.key}>
                  {t(entry.label as 'settings.aiOllama')}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SettingRow>

      <SettingRow label={t('settings.aiServer')} hint={t('settings.aiServerHint')}>
        <div className="flex w-72 items-center gap-2">
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={AI_DEFAULT_URLS[provider]}
          />
          <Button variant="outline" size="sm" disabled={checking} onClick={check}>
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
              <Icon.chevron className="size-3 rotate-90 opacity-60" />
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

function EditorSection() {
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

function IntegrationsSection({
  account,
  onDisconnected,
}: {
  account: AccountView | null;
  onDisconnected: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-7">
      {HOSTS.map((host) => (
        <SettingRow key={host.id} label={host.label} hint={t('settings.connectHint')}>
          <HostCard
            host={host}
            seeded={host.id === 'github' ? account : null}
            onDisconnected={onDisconnected}
          />
        </SettingRow>
      ))}
    </div>
  );
}


