import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Session } from '../session';
import type { Operation } from '../types';
import { TOOLBAR_ACTIONS } from '../vocabulary';
import { Icon } from '../icons';

type Props = { session: Session | null; onRun: (operation: Operation) => void; busy: boolean };

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-muted-foreground text-2xs lowercase">{label}</span>
      <span className="max-w-44 truncate text-sm font-medium">{value}</span>
    </div>
  );
}

export function Toolbar({ session, onRun, busy }: Props) {
  const { t } = useTranslation();
  const head = session?.repo?.refs.find((r) => r.isHead);

  return (
    <div className="bg-card border-border flex shrink-0 items-center gap-5 border-b px-3 py-1.5">
      <Field label={t('toolbar.repositoryLabel')} value={session?.name ?? '—'} />
      <Field label={t('toolbar.branchLabel')} value={head?.name ?? '—'} />

      <Separator orientation="vertical" className="h-6" />

      <div className="flex items-center gap-1">
        {TOOLBAR_ACTIONS.map(({ label, icon, operation }) => {
          const Glyph = Icon[icon];
          const button = (
            <Button
              variant="ghost"
              size="sm"
              disabled={!operation || busy}
              onClick={() => operation && onRun(operation)}
              className="h-7 gap-1.5 px-2.5"
            >
              <Glyph className="size-3.5" />
              {label}
            </Button>
          );

          if (operation) return <span key={label}>{button}</span>;
          return (
            <Tooltip key={label}>
              <TooltipTrigger asChild>
                <span tabIndex={0}>{button}</span>
              </TooltipTrigger>
              <TooltipContent>{t('toolbar.needsOperations')}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
