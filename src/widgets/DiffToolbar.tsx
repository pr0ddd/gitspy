import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Hint } from '@/components/ui/tooltip';
import { Icon } from '@/icons';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DIFF_MODES, type DiffMode } from '@/entities/diff';

const MODE_HINT: Record<DiffMode, string> = {
  hunk: 'diff.hunkView',
  split: 'diff.splitView',
  inline: 'diff.inlineView',
};

const MODE_ICON: Record<DiffMode, keyof typeof Icon> = {
  hunk: 'diffHunk',
  split: 'diffSplit',
  inline: 'diffInline',
};

type Props = {
  view: 'file' | 'diff';
  mode: DiffMode;
  whitespace: boolean;
  wrap: boolean;
  onView: (view: 'file' | 'diff') => void;
  onMode: (mode: DiffMode) => void;
  onWhitespace: (on: boolean) => void;
  onWrap: (on: boolean) => void;
  onStep: (where: 'previous' | 'next') => void;
  start?: React.ReactNode;
  badge?: React.ReactNode;
  extra?: React.ReactNode;
  end?: React.ReactNode;
};

export function DiffToolbar({
  view,
  mode,
  whitespace,
  wrap,
  onView,
  onMode,
  onWhitespace,
  onWrap,
  onStep,
  start,
  badge,
  extra,
  end,
}: Props) {
  const { t } = useTranslation();

  return (
    <div className="flex h-11 shrink-0 items-center gap-3 border-b px-3">
      <div className="flex flex-1 items-center gap-1">{start}</div>

      <div className="flex shrink-0 items-center gap-1">
        {badge}
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={view}
          onValueChange={(next) => {
            if (next) onView(next as 'file' | 'diff');
          }}
        >
          <ToggleGroupItem value="file">{t('diff.fileView')}</ToggleGroupItem>
          <ToggleGroupItem value="diff">{t('diff.diffView')}</ToggleGroupItem>
        </ToggleGroup>
        {extra}
      </div>

      <div className="flex flex-1 items-center justify-end gap-1">
        {end}
        {end ? <Separator orientation="vertical" className="mx-1.5 !h-4" /> : null}
        <Hint text={t('diff.previous')}>
          <Button variant="action" size="xs" onClick={() => onStep('previous')}>
            <Icon.up className="size-4" />
          </Button>
        </Hint>
        <Hint text={t('diff.next')}>
          <Button variant="action" size="xs" onClick={() => onStep('next')}>
            <Icon.down className="size-4" />
          </Button>
        </Hint>
        <Separator orientation="vertical" className="mx-1.5 !h-4" />
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={view === 'diff' ? mode : ''}
          onValueChange={(next) => {
            if (!next) return;
            onView('diff');
            onMode(next as DiffMode);
          }}
        >
          {DIFF_MODES.map((shown) => {
            const ModeIcon = Icon[MODE_ICON[shown]];
            return (
              <Hint key={shown} text={t(MODE_HINT[shown] as 'diff.splitView')}>
                <ToggleGroupItem value={shown} aria-label={t(MODE_HINT[shown] as 'diff.splitView')}>
                  <ModeIcon />
                </ToggleGroupItem>
              </Hint>
            );
          })}
        </ToggleGroup>
        <Separator orientation="vertical" className="mx-1.5 !h-4" />
        <Hint text={t('diff.whitespace')}>
          <Toggle
            variant="outline"
            size="sm"
            pressed={whitespace}
            aria-label={t('diff.whitespace')}
            onPressedChange={onWhitespace}
          >
            <Icon.whitespace />
          </Toggle>
        </Hint>
        <Hint text={t('diff.wrap')}>
          <Toggle
            variant="outline"
            size="sm"
            pressed={wrap}
            aria-label={t('diff.wrap')}
            onPressedChange={onWrap}
          >
            <Icon.wrap />
          </Toggle>
        </Hint>
      </div>
    </div>
  );
}
