import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Hint } from '@/shared/ui/tooltip';
import { Icon, type IconName } from '@/shared/ui/icons';
import { shortenDirectory, splitPath } from '@/shared/lib/paths';

const PROSE =
  '[&_a]:text-primary [&_code]:rounded-sm [&_code]:bg-fill-1 [&_code]:px-1 [&_code]:font-mono [&_details]:rounded-md [&_details]:border [&_details]:border-border [&_details]:p-2 [&_h1]:mt-4 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-medium [&_hr]:border-border [&_img]:max-w-full [&_li]:ml-4 [&_ol]:list-decimal [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-fill-1 [&_pre]:p-2 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:whitespace-pre [&_summary]:cursor-pointer [&_summary]:text-muted-foreground [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-0.5 [&_td]:whitespace-nowrap [&_th]:border [&_th]:border-border [&_th]:bg-fill-1 [&_th]:px-2 [&_th]:py-0.5 [&_th]:font-medium [&_th]:whitespace-nowrap [&_ul]:list-disc';

export function Prose({ text, compact }: { text: string; compact?: boolean }) {
  return (
    <div
      className={cn(
        PROSE,
        compact
          ? 'space-y-2 text-xs leading-5 [&_code]:text-[0.95em]'
          : 'space-y-3 text-sm leading-relaxed [&_code]:text-xs',
      )}
    >
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSanitize]}>
        {text}
      </Markdown>
    </div>
  );
}

export const HOVER_FILL = 'hover:bg-hover-fill';

const INDENT = ['pl-0', 'pl-4', 'pl-8', 'pl-12', 'pl-16', 'pl-20'] as const;

const indentAt = (depth: number) => INDENT[Math.min(depth, INDENT.length - 1)];

export const FOCUS_FILL = 'outline-none focus-visible:bg-hover-fill';

type ListRowProps = {
  as?: 'button' | 'div';
  tall?: boolean;
  depth?: number;
  gutter?: React.ReactNode;
  current?: boolean;
  selected?: boolean;
  tabIndex?: number;
  rowRef?: React.Ref<HTMLElement>;
  hint?: string;
  hintSide?: React.ComponentProps<typeof Hint>['side'];
  title?: string;
  className?: string;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onContextMenu?: () => void;
  tail?: React.ReactNode;
  children: React.ReactNode;
};

export function ListRow({
  as = 'button',
  tall,
  depth = 0,
  gutter,
  current,
  selected,
  tabIndex,
  rowRef,
  hint,
  hintSide,
  title,
  className,
  onClick,
  onDoubleClick,
  onContextMenu,
  tail,
  children,
}: ListRowProps) {
  const Tag = as;
  const row = (
    <Tag
      ref={rowRef as React.Ref<HTMLButtonElement & HTMLDivElement>}
      title={title}
      role={selected === undefined ? undefined : 'option'}
      aria-selected={selected}
      tabIndex={tabIndex}
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
        'text-subject relative flex w-full items-center gap-2.5 rounded-md px-2 text-left text-xs',
        FOCUS_FILL,
        tall ? 'h-11' : 'h-8',
        as === 'div' && 'group cursor-pointer',
        current && 'text-foreground font-medium',
        selected ? 'bg-control-fill text-foreground' : 'hover:bg-hover-fill',
        className,
      )}
    >
      {gutter === undefined ? null : (
        <span className="flex w-3.5 shrink-0 items-center justify-center">{gutter}</span>
      )}
      <span className={cn('flex min-w-0 flex-1 items-center gap-2.5', indentAt(depth))}>
        {children}
      </span>
      {tail === undefined ? null : (
        <span
          className={cn(
            'absolute inset-y-0 right-1.5 flex items-center opacity-0',
            'group-hover:opacity-100 focus-within:opacity-100',
            selected && 'opacity-100',
          )}
        >
          {tail}
        </span>
      )}
    </Tag>
  );

  if (!hint) return row;
  return (
    <Hint text={hint} side={hintSide}>
      {row}
    </Hint>
  );
}

const BAR = 'border-border flex h-8 shrink-0 items-center gap-2 border-b px-3 text-xs';

export const SCROLLBAR_GUTTER = 'pr-gutter';

type SectionHeaderProps = {
  onClick?: () => void;
  band?: boolean;
  overList?: boolean;
  className?: string;
  children: React.ReactNode;
};

export function SectionHeader({
  onClick,
  band,
  overList,
  className,
  children,
}: SectionHeaderProps) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={cn(
        band
          ? 'border-border text-subject flex h-9 w-full shrink-0 items-center gap-2 border-b px-3 text-xs font-medium'
          : 'text-muted-foreground flex h-7.5 w-full shrink-0 items-center gap-2.5 rounded-md px-2 text-xs',
        overList && SCROLLBAR_GUTTER,
        onClick && cn('hover:bg-hover-fill', FOCUS_FILL),
        className,
      )}
    >
      {children}
    </Tag>
  );
}

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
      {letter === '?' ? 'A' : letter}
    </span>
  );
}

const SEARCH_INSET = {
  xs: { icon: 'left-2 size-3', pad: 'pl-7', padTrailing: 'pr-20' },
  sm: { icon: 'left-3 size-3.5', pad: 'pl-8', padTrailing: 'pr-24' },
} as const;

export function SearchField({
  value,
  placeholder,
  size = 'sm',
  fieldRef,
  trailing,
  onChange,
  onFocus,
  onKeyDown,
}: {
  value: string;
  placeholder: string;
  size?: keyof typeof SEARCH_INSET;
  fieldRef?: React.Ref<HTMLInputElement>;
  trailing?: React.ReactNode;
  onChange: (text: string) => void;
  onFocus?: () => void;
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
        ref={fieldRef}
        value={value}
        size={size}
        placeholder={placeholder}
        className={cn(inset.pad, trailing && inset.padTrailing)}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
      />
      {trailing ? (
        <span className="absolute inset-y-0 right-1 flex items-center gap-0.5">{trailing}</span>
      ) : null}
    </div>
  );
}

export function Chip({
  head,
  filled,
  title,
  onClick,
  children,
}: {
  head?: boolean;
  filled?: boolean;
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
        'inline-flex h-6 max-w-full items-center gap-1.5 rounded-md px-2 text-xs',
        filled
          ? 'bg-ref-local/25 text-foreground'
          : cn(
              'border-chip-border bg-chip-background border',
              head ? 'border-primary/50 text-foreground' : 'text-muted-foreground',
            ),
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
    <ViewBar className={cn('pr-0', tone === 'conflict' ? 'bg-banner-conflict' : 'bg-banner')}>
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
        size="bar"
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
        FOCUS_FILL,
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
  dot?: string;
  closeLabel?: string;
  onSelect: () => void;
  onClose?: () => void;
};

export function Tab({ icon, label, current, title, dot, closeLabel, onSelect, onClose }: TabProps) {
  const Glyph = Icon[icon];
  const tab = (
    <div
      role="tab"
      aria-selected={current}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        onSelect();
      }}
      className={cn(
        'group flex h-7.5 max-w-56 cursor-pointer items-center gap-2 rounded-md pr-1.5 pl-3 text-xs whitespace-nowrap',
        FOCUS_FILL,
        current ? 'bg-control-fill text-foreground' : 'text-muted-foreground hover:bg-hover-fill',
      )}
    >
      <Glyph className={cn('size-3.5 shrink-0', !current && 'opacity-75')} />
      <span className="min-w-0 truncate">{label}</span>
      {dot ? <span className={cn('size-1.5 shrink-0 rounded-full', dot)} /> : null}
      {onClose && closeLabel ? (
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
      ) : (
        <span className="w-1.5 shrink-0" />
      )}
    </div>
  );

  return title ? (
    <Hint text={title} side="bottom">
      {tab}
    </Hint>
  ) : (
    tab
  );
}

type ResizeGripProps = {
  name: string;
  label: string;
  edge: 'left' | 'right' | 'top';
  onStart: () => void;
  onMove: (delta: number) => void;
  onEnd: () => void;
};

const GRIP_NUDGE = 16;

const nudgeFor = (key: string, alongY: boolean): number | null => {
  if (alongY) return key === 'ArrowUp' ? -GRIP_NUDGE : key === 'ArrowDown' ? GRIP_NUDGE : null;
  return key === 'ArrowLeft' ? -GRIP_NUDGE : key === 'ArrowRight' ? GRIP_NUDGE : null;
};

const GRIP_EDGE = {
  left: 'inset-y-0 left-0 w-1 cursor-col-resize',
  right: 'inset-y-0 right-0 w-1 cursor-col-resize',
  top: 'inset-x-0 top-0 h-1 cursor-row-resize',
} as const;

export function ResizeGrip({ name, label, edge, onStart, onMove, onEnd }: ResizeGripProps) {
  const alongY = edge === 'top';
  return (
    <div
      data-grip={name}
      data-edge={edge}
      role="separator"
      aria-label={label}
      aria-orientation={alongY ? 'horizontal' : 'vertical'}
      tabIndex={0}
      onKeyDown={(event) => {
        const nudge = nudgeFor(event.key, alongY);
        if (nudge === null) return;
        event.preventDefault();
        onStart();
        onMove(nudge);
        onEnd();
      }}
      className={cn(
        'hover:bg-fill-2 active:bg-fill-3 focus-visible:bg-fill-2 absolute z-10 transition-colors outline-none',
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
