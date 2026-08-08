import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Hint } from '@/components/ui/tooltip';
import { Icon, type IconName } from '@/icons';
import { shortenDirectory, splitPath } from '@/paths';

export const HOVER_FILL = 'hover:bg-hover-fill';

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
        'text-subject flex w-full items-center gap-2.5 rounded-md px-2 text-left text-xs',
        tall ? 'h-11' : 'h-8',
        as === 'div' && 'group cursor-pointer',
        current ? 'text-foreground bg-control-fill font-medium' : 'hover:bg-hover-fill',
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
        'text-muted-foreground flex h-7.5 w-full shrink-0 items-center gap-2.5 rounded-md px-2 text-xs',
        onClick && 'hover:bg-hover-fill',
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
        'text-2xs flex size-3.5 shrink-0 items-center justify-center rounded-xs font-semibold',
        STATUS_TONE[letter] ?? 'bg-fill-2 text-muted-foreground',
      )}
    >
      {letter}
    </span>
  );
}

const SEARCH_INSET = {
  xs: { icon: 'left-2 size-3', pad: 'pl-7' },
  sm: { icon: 'left-3 size-3.5', pad: 'pl-8' },
} as const;

export function SearchField({
  value,
  placeholder,
  size = 'sm',
  onChange,
  onKeyDown,
}: {
  value: string;
  placeholder: string;
  size?: keyof typeof SEARCH_INSET;
  onChange: (text: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const inset = SEARCH_INSET[size];
  return (
    <div className="relative min-w-0 flex-1">
      <Icon.search
        className={cn(
          'text-muted-foreground pointer-events-none absolute top-1/2 -translate-y-1/2',
          inset.icon,
        )}
      />
      <Input
        value={value}
        size={size}
        placeholder={placeholder}
        className={inset.pad}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}

export function Chip({
  head,
  title,
  onClick,
  children,
}: {
  head?: boolean;
  title?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      title={title}
      onClick={onClick}
      className={cn(
        'border-chip-border bg-chip-background inline-flex h-6 max-w-full items-center gap-1.5 rounded-md border px-2 text-xs',
        head ? 'border-primary/50 text-foreground' : 'text-muted-foreground',
        onClick && HOVER_FILL,
      )}
    >
      {children}
    </Tag>
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
        size="3xs"
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
        'flex shrink-0 items-center rounded-md',
        label ? 'h-8 w-full gap-2.5 px-2 text-sm' : 'size-8 justify-center',
        active
          ? 'bg-fill-2 text-foreground'
          : 'text-muted-foreground hover:bg-hover-fill hover:text-foreground',
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
        'group flex h-7.5 max-w-56 cursor-pointer items-center gap-2 rounded-md pr-1.5 pl-3 text-xs whitespace-nowrap',
        current ? 'bg-control-fill text-foreground' : 'text-muted-foreground hover:bg-hover-fill',
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
  edge: 'left' | 'right' | 'top';
  onStart: () => void;
  onMove: (delta: number) => void;
  onEnd: () => void;
};

const GRIP_EDGE = {
  left: 'inset-y-0 left-0 w-1 cursor-col-resize',
  right: 'inset-y-0 right-0 w-1 cursor-col-resize',
  top: 'inset-x-0 top-0 h-1 cursor-row-resize',
} as const;

export function ResizeGrip({ edge, onStart, onMove, onEnd }: ResizeGripProps) {
  const alongY = edge === 'top';
  return (
    <div
      className={cn(
        'hover:bg-fill-2 active:bg-fill-3 absolute z-10 transition-colors',
        GRIP_EDGE[edge],
      )}
      onPointerDown={(event) => {
        event.preventDefault();
        const grip = event.currentTarget;
        const from = alongY ? event.clientY : event.clientX;
        grip.setPointerCapture(event.pointerId);
        onStart();
        const moved = (raw: PointerEvent) => onMove((alongY ? raw.clientY : raw.clientX) - from);
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
      <span className="text-muted-foreground min-w-0 shrink truncate">
        {shortenDirectory(directory, budget)}
      </span>
      <span className="max-w-full shrink-0 truncate">{name}</span>
    </span>
  );
}
