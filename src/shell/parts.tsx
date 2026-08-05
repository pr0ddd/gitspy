import { cn } from '@/lib/utils';
import { Hint } from '@/components/ui/tooltip';
import { shortenDirectory, splitPath } from '../paths';

const INDENT = ['pl-0', 'pl-4', 'pl-8', 'pl-12', 'pl-16', 'pl-20'] as const;

const indentAt = (depth: number) => INDENT[Math.min(depth, INDENT.length - 1)];

type ListRowProps = {
  as?: 'button' | 'div';
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
        'flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-xs transition-colors',
        as === 'div' && 'group cursor-pointer',
        current ? 'bg-fill-2 font-medium' : 'hover:bg-fill-1',
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

export function ViewBar({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <header
      className={cn(
        'border-header-line bg-surface-raised flex h-8 shrink-0 items-center gap-2 border-b px-3 text-xs',
        className,
      )}
    >
      {children}
    </header>
  );
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
        'first:border-b-header-line flex h-8 shrink-0 items-center gap-2 border-t px-3 text-xs first:border-t-0 first:border-b first:bg-surface-raised',
        className,
      )}
    >
      {children}
    </div>
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
    <button
      onClick={onClick}
      className={cn(
        'border-header-line flex h-8 shrink-0 items-center gap-2 border-y px-3 text-left transition-colors',
        tone === 'conflict'
          ? 'bg-conflict text-destructive-foreground hover:bg-conflict/90'
          : 'bg-primary text-primary-foreground hover:bg-primary-hover',
      )}
    >
      <span className="flex-1 truncate text-xs">{label}</span>
      <span className="text-2xs shrink-0 rounded-md border border-current px-2 py-0.5 font-medium">
        {action}
      </span>
    </button>
  );
}

export function PanelNote({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground p-4 text-center text-xs">{children}</p>;
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
