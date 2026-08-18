import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';
import { Icon, type IconName } from '@/shared/ui/icons';
import { Hint } from '@/shared/ui/tooltip';
import { NavItem, ViewBar } from '@/shared/ui/parts';
import { clampPanel, PANEL_LIMITS } from '@/shared/lib/resize';
import { usePref } from '@/shared/lib/prefs';

import { GeneralSection } from './GeneralSection';
import { InterfaceSection } from './InterfaceSection';
import { AiSection } from './AiSection';
import { EditorSection } from './EditorSection';
import { IntegrationsSection } from './IntegrationsSection';
type Props = {
  open: boolean;
  collapsed: boolean;
  zoom: number;
  onZoom: (zoom: number) => void;
  compact: boolean;
  onCompact: (compact: boolean) => void;
  onToggle: () => void;
};

type SectionKey = 'general' | 'interface' | 'editor' | 'integrations' | 'ai';

const SECTIONS: ReadonlyArray<{ key: SectionKey; label: string; icon: IconName }> = [
  { key: 'general', label: 'settings.general', icon: 'settings' },
  { key: 'interface', label: 'settings.interface', icon: 'appearance' },
  { key: 'editor', label: 'settings.editor', icon: 'edit' },
  { key: 'integrations', label: 'settings.integrations', icon: 'host' },
  { key: 'ai', label: 'settings.ai', icon: 'sparkle' },
];

export function Settings({ open, collapsed, zoom, onZoom, compact, onCompact, onToggle }: Props) {
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
              <IntegrationsSection />
            )}
          </div>
        </main>
      </div>
    </>
  );
}
