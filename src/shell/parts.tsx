import { cn } from '@/lib/utils';
import { Hint } from '@/components/ui/tooltip';
import { shortenDirectory, splitPath } from '../paths';

const INDENT = ['pl-2', 'pl-3', 'pl-6', 'pl-9', 'pl-12', 'pl-16'] as const;

const indentAt = (depth: number) => INDENT[Math.min(depth, INDENT.length - 1)];

type ListRowProps = {
  as?: 'button' | 'div';
  depth?: number;
  current?: boolean;
  hint?: string;
  hintSide?: React.ComponentProps<typeof Hint>['side'];
  className?: string;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onContextMenu?: () => void;
  children: React.ReactNode;
};

export function ListRow({
  as = 'button',
  depth = 0,
  current,
  hint,
  hintSide,
  className,
  onClick,
  onDoubleClick,
  onContextMenu,
  children,
}: ListRowProps) {
  const Tag = as;
  const row = (
    <Tag
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
        'hover:bg-surface-hover flex h-7 w-full items-center gap-1.5 pr-2 text-left text-xs transition-colors',
        indentAt(depth),
        as === 'div' && 'group cursor-pointer',
        current && 'bg-ahead/15 font-medium',
        className,
      )}
    >
      {children}
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
  border?: 'top' | 'bottom';
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
};

export function SectionHeader({ border = 'top', onClick, className, children }: SectionHeaderProps) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={cn(
        'border-border/50 text-muted-foreground flex h-8 w-full shrink-0 items-center gap-1.5 px-2 text-xs tracking-wide uppercase transition-colors',
        border === 'top' ? 'border-t' : 'border-b',
        onClick && 'hover:bg-surface-hover',
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
        'bg-card border-border flex h-9 shrink-0 items-center gap-2 border-b px-3',
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
        'border-border flex h-8 shrink-0 items-center gap-2 border-b px-3 text-xs',
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
        'border-border flex h-8 shrink-0 items-center gap-2 border-b px-3 text-left transition-colors',
        tone === 'conflict'
          ? 'bg-conflict/15 hover:bg-conflict/25'
          : 'bg-primary/15 hover:bg-primary/25',
      )}
    >
      <span
        className={cn(
          'flex-1 truncate text-xs',
          tone === 'conflict' ? 'text-conflict' : 'text-primary',
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          'shrink-0 text-xs font-medium',
          tone === 'conflict' ? 'text-conflict' : 'text-primary',
        )}
      >
        {action}
      </span>
    </button>
  );
}

export function PanelNote({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground p-4 text-center text-xs">{children}</p>;
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
