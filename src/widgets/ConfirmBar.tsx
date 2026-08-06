import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { Operation } from '@/types';

type Props = {
  operation: Operation | null;
  onConfirm: (operation: Operation) => void;
  onCancel: () => void;
};

export function ConfirmBar({ operation, onConfirm, onCancel }: Props) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!operation) return;
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [operation, onCancel]);

  if (!operation) return null;

  return (
    <div className="bg-primary/15 animate-in fade-in flex h-11 shrink-0 items-center justify-center gap-3 px-4 duration-150">
      <span className="text-sm">{t(`confirm.${operation.kind}` as 'confirm.discardAll')}</span>
      <Button size="xs" variant="destructive" onClick={() => onConfirm(operation)}>
        {t(`confirm.${operation.kind}Action` as 'confirm.discardAllAction')}
      </Button>
      <Button size="xs" variant="secondary" onClick={onCancel}>
        {t('ask.cancel')}
      </Button>
    </div>
  );
}
