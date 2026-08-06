import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Hint } from '@/components/ui/tooltip';
import { Icon, type IconName } from '@/icons';
import { shortenDirectory, splitPath } from '@/paths';

export const HOVER_FILL = 'hover:bg-fill-1 transition-colors';

const INDENT = ['pl-0', 'pl-4', 'pl-8', 'pl-12', 'pl-16', 'pl-20'] as const;

const indentAt = (depth: number) => INDENT[Math.min(depth, INDENT.length - 1)];

type ListRowProps = {
  as?: 'button' | 'div';
  tall?: boolean;
  depth?: number;
  gutter?: React.ReactNode;
  current?: boolean;
  hint?: string;
  hintSide?: React.ComponentProps<typeof Hint>['side'];
  title?: string;
  className?: string;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onContextMenu?: () => void;
  children: React.ReactNode;
};

export function ListRow({
  as = 'button',
  tall,
  depth = 0,
  gutter,
  current,
  hint,
  hintSide,
  title,
  className,
  onClick,
  onDoubleClick,
  onContextMenu,
  children,
}: ListRowProps) {
  const Tag = as;
  const row = (
    <Tag
      title={title}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={
        onContextMenu
          ? (e: React.MouseEvent) => {
              e.preventDefault();
              onContextMenu();
            }
          : undefined
      }
      className={cn(
        'text-subject flex w-full items-center gap-2.5 rounded-md px-2 text-left text-xs transition-colors',
        tall ? 'h-11' : 'h-8',
        as === 'div' && 'group cursor-pointer',
        current ? 'text-foreground bg-fill-2 font-medium' : 'hover:bg-fill-1',
        className,
      )}
    >
      {gutter === undefined ? null : (
        <span className="flex w-3.5 shrink-0 items-center justify-center">{gutter}</span>
      )}
      <span className={cn('flex min-w-0 flex-1 items-center gap-2.5', indentAt(depth))}>
        {children}
      </span>
    </Tag>
  );

  if (!hint) return row;
  return (
    <Hint text={hint} side={hintSide}>
      {row}
    </Hint>
  );
}

type SectionHeaderProps = {
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
};

export function SectionHeader({ onClick, className, children }: SectionHeaderProps) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={cn(
        'text-muted-foreground flex h-7.5 w-full shrink-0 items-center gap-2.5 rounded-md px-2 text-xs transition-colors',
        onClick && 'hover:bg-fill-1',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

const BAR = 'border-border flex h-8 shrink-0 items-center gap-2 border-b px-3 text-xs';

export function ViewBar({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <header className={cn(BAR, 'bg-surface-raised', className)}>{children}</header>;
}

export function PanelBar({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'first:border-b-border flex h-8 shrink-0 items-center gap-2 border-t px-3 text-xs first:border-t-0 first:border-b first:bg-surface-raised',
        className,
      )}
    >
      {children}
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  A: 'bg-added/15 text-added',
  C: 'bg-renamed/15 text-renamed',
  M: 'bg-modified/15 text-modified',
  T: 'bg-modified/15 text-modified',
  D: 'bg-deleted/15 text-deleted',
  R: 'bg-renamed/15 text-renamed',
  U: 'bg-conflict/15 text-conflict',
  '?': 'bg-added/15 text-added',
};

export function StatusBadge({ letter }: { letter: string }) {
  return (
    <span
      className={cn(
        'text-2xs flex size-3.5 shrink-0 items-center justify-center rounded-sm font-semibold',
        STATUS_TONE[letter] ?? 'bg-fill-2 text-muted-foreground',
      )}
    >
      {letter}
    </span>
  );
}

export function InlineNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground flex h-7 items-center gap-1.5 pl-6 text-xs">{children}</p>
  );
}

export function PanelBanner({
  tone = 'primary',
  label,
  action,
  onClick,
}: {
  tone?: 'primary' | 'conflict';
  label: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <ViewBar className={tone === 'conflict' ? 'bg-banner-conflict' : 'bg-banner'}>
      <span
        className={cn(
          'flex-1 truncate',
          tone === 'conflict' ? 'text-destructive' : 'text-foreground',
        )}
      >
        {label}
      </span>
      <Button
        variant={tone === 'conflict' ? 'destructiveSoft' : 'default'}
        size="2xs"
        onClick={onClick}
      >
        {action}
      </Button>
    </ViewBar>
  );
}

export function PanelNote({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground p-4 text-center text-xs">{children}</p>;
}

type NavItemProps = {
  icon?: IconName;
  lead?: React.ReactNode;
  label?: string;
  name?: string;
  active?: boolean;
  hint?: string;
  hintSide?: React.ComponentProps<typeof Hint>['side'];
  end?: React.ReactNode;
  onClick: () => void;
};

export function NavItem({
  icon,
  lead,
  label,
  name,
  active,
  hint,
  hintSide,
  end,
  onClick,
}: NavItemProps) {
  const Glyph = icon ? Icon[icon] : null;
  const button = (
    <button
      aria-label={name ?? label ?? hint}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex shrink-0 items-center rounded-md transition-colors',
        label ? 'h-8 w-full gap-2.5 px-2 text-sm' : 'size-8 justify-center',
        active
          ? 'bg-fill-2 text-foreground'
          : 'text-muted-foreground hover:bg-fill-1 hover:text-foreground',
      )}
    >
      {Glyph ? <Glyph className="size-4 opacity-75" /> : lead}
      {label ? <span className="min-w-0 flex-1 truncate text-left">{label}</span> : null}
      {end}
    </button>
  );
  return hint ? (
    <Hint text={hint} side={hintSide}>
      {button}
    </Hint>
  ) : (
    button
  );
}

type TabProps = {
  icon: IconName;
  label: string;
  current: boolean;
  title?: string;
  closeLabel: string;
  onSelect: () => void;
  onClose: () => void;
};

export function Tab({ icon, label, current, title, closeLabel, onSelect, onClose }: TabProps) {
  const Glyph = Icon[icon];
  return (
    <div
      title={title}
      onClick={onSelect}
      className={cn(
        'group flex h-7.5 max-w-56 cursor-pointer items-center gap-2 rounded-md pr-1.5 pl-3 text-xs whitespace-nowrap transition-colors',
        current ? 'bg-fill-2 text-foreground' : 'text-muted-foreground hover:bg-fill-1',
      )}
    >
      <Glyph className={cn('size-3.5 shrink-0', !current && 'opacity-75')} />
      <span className="min-w-0 truncate">{label}</span>
      <Button
        variant="muted"
        size="icon-2xs"
        reveal
        className={cn(current && 'opacity-100')}
        aria-label={closeLabel}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <Icon.close />
      </Button>
    </div>
  );
}

type ResizeGripProps = {
  edge: 'left' | 'right';
  onStart: () => void;
  onMove: (dx: number) => void;
  onEnd: () => void;
};

export function ResizeGrip({ edge, onStart, onMove, onEnd }: ResizeGripProps) {
  return (
    <div
      className={cn(
        'hover:bg-fill-2 active:bg-fill-3 absolute inset-y-0 z-10 w-1 cursor-col-resize transition-colors',
        edge === 'left' ? 'left-0' : 'right-0',
      )}
      onPointerDown={(event) => {
        event.preventDefault();
        const grip = event.currentTarget;
        const from = event.clientX;
        grip.setPointerCapture(event.pointerId);
        onStart();
        const moved = (raw: PointerEvent) => onMove(raw.clientX - from);
        const done = () => {
          grip.removeEventListener('pointermove', moved);
          onEnd();
        };
        grip.addEventListener('pointermove', moved);
        grip.addEventListener('pointerup', done, { once: true });
        grip.addEventListener('pointercancel', done, { once: true });
      }}
    />
  );
}

export function FilePath({ path, budget = 64 }: { path: string; budget?: number }) {
  const { directory, name } = splitPath(path);
  return (
    <span className="flex min-w-0 items-baseline">
      <span className="text-muted-foreground min-w-0 truncate">
        {shortenDirectory(directory, budget)}
      </span>
      <span className="min-w-16 truncate">{name}</span>
    </span>
  );
}
