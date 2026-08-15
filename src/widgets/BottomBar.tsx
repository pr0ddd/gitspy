import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Hint } from '@/components/ui/tooltip';
import { Icon } from '@/icons';
import { chordLabel, onApple } from '@/keys';
import { ZOOM_STEPS, zoomIn, zoomLabel, zoomOut } from '@/zoom';

type Props = {
  zoom: number;
  onZoom: (zoom: number) => void;
  ready: string | null;
  onRestart: () => void;
  onShortcuts: () => void;
  onChangelog: () => void;
};

export function BottomBar({ zoom, onZoom, ready, onRestart, onShortcuts, onChangelog }: Props) {
  const { t } = useTranslation();
  const shortcutsHint = `${t('shortcuts.title')} (${chordLabel({ key: '/', primary: true }, onApple())})`;
  return (
    <div className="flex h-6 shrink-0 items-center gap-2 px-1.5">
      <span className="flex-1" />

      <Hint text={shortcutsHint} side="top">
        <Button
          variant="ghost"
          size="icon-2xs"
          aria-label={t('shortcuts.title')}
          onClick={onShortcuts}
        >
          <Icon.keyboard className="text-faint size-3.5" />
        </Button>
      </Hint>
      <Hint text={t('changelog.open')} side="top">
        <Button
          variant="ghost"
          size="icon-2xs"
          aria-label={t('changelog.open')}
          onClick={onChangelog}
        >
          <Icon.changelog className="text-faint size-3.5" />
        </Button>
      </Hint>
      <span className="flex items-center">
        <Button
          variant="ghost"
          size="icon-2xs"
          aria-label={t('zoom.out')}
          onClick={() => onZoom(zoomOut(zoom))}
        >
          <Icon.zoomOut className="text-faint size-3" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="2xs"
              className="text-faint px-1 font-normal tabular-nums"
              aria-label={t('zoom.pick')}
            >
              {zoomLabel(zoom)}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="min-w-0">
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
        <Button
          variant="ghost"
          size="icon-2xs"
          aria-label={t('zoom.in')}
          onClick={() => onZoom(zoomIn(zoom))}
        >
          <Icon.zoomIn className="text-faint size-3" />
        </Button>
      </span>

      {ready ? (
        <Button variant="muted" size="2xs" onClick={onRestart}>
          <Icon.update className="size-3" />
          {t('update.restart', { version: ready })}
        </Button>
      ) : null}
      <span className="text-faint text-2xs tabular-nums">{__APP_VERSION__}</span>
    </div>
  );
}
