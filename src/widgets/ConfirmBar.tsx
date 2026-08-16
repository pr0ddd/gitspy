import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';
import { confirmationOf, type Confirmation, type Effect } from '@/entities/repo';

type Props = {
  confirmation: Confirmation | null;
  onChoice: (effect: Effect) => void;
  onCancel: () => void;
};

export function ConfirmBar({ confirmation, onChoice, onCancel }: Props) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!confirmation) return;
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [confirmation, onCancel]);

  if (!confirmation) return null;
  const text = confirmationOf(confirmation);

  return (
    <div
      role="alertdialog"
      className="bg-primary/15 animate-in fade-in flex h-12 shrink-0 items-center justify-center gap-3 px-4 duration-150"
    >
      <span className="text-sm">{t(text.message as 'confirm.branchDelete', text.params)}</span>
      {text.choices.map((choice) => (
        <Button
          key={choice.label}
          size="sm"
          variant={choice.tone === 'destructive' ? 'destructive' : 'default'}
          onClick={() => onChoice(choice.effect)}
        >
          {t(choice.label as 'confirm.discardAllAction')}
        </Button>
      ))}
      <Button size="sm" variant="secondary" onClick={onCancel}>
        {t('ask.cancel')}
      </Button>
    </div>
  );
}
