import { useTranslation } from 'react-i18next';
import { Hint } from '@/shared/ui/tooltip';
import { cn } from '@/shared/lib/utils';
import { Icon } from '@/shared/ui/icons';
import { HOVER_FILL } from '@/shared/ui/parts';
import { capped, VIEWS, type ViewKey } from './views';

export function ViewSwitch({
  views,
  active,
  counts,
  onPick,
}: {
  views: readonly (typeof VIEWS)[number][];
  active: ViewKey;
  counts: Record<ViewKey, number | null>;
  onPick: (key: ViewKey) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="mx-2.5 mb-2 flex shrink-0 items-center gap-0.5">
      {views.map(({ key, title, icon }) => {
        const Glyph = Icon[icon];
        const count = counts[key];
        const chosen = key === active;
        const name = t(title);
        return (
          <Hint key={key} text={count === null ? name : `${name} · ${count}`}>
            <button
              aria-label={name}
              aria-pressed={chosen}
              onClick={() => onPick(key)}
              className={cn(
                'flex h-8 items-center rounded-full px-2 text-xs transition-colors',
                chosen
                  ? 'bg-control-fill text-foreground min-w-0 font-medium'
                  : cn(HOVER_FILL, 'text-muted-foreground hover:text-foreground shrink-0'),
              )}
            >
              <Glyph className="size-3.5 shrink-0" />
              {chosen ? (
                <span className="animate-in fade-in flex min-w-0 items-center gap-1.5 pl-1.5 duration-150">
                  <span className="truncate">{name}</span>
                  {count === null ? null : (
                    <span className="text-faint shrink-0 tabular-nums">{capped(count)}</span>
                  )}
                </span>
              ) : null}
            </button>
          </Hint>
        );
      })}
    </div>
  );
}
