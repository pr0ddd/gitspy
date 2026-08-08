import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { askAgentInDock } from '@/features/agent';
import { Icon } from '@/icons';
import { notifyError } from '@/toast';

type Props = {
  repo: string;
  mention: string;
  reveal?: boolean;
  className?: string;
};

export function AskAgentButton({ repo, mention, reveal, className }: Props) {
  const { t } = useTranslation();
  return (
    <Button
      variant="ghost"
      size="2xs"
      reveal={reveal}
      className={className}
      title={t('agent.ask')}
      aria-label={t('agent.ask')}
      onClick={(event) => {
        event.stopPropagation();
        askAgentInDock(repo, mention).catch(notifyError);
      }}
    >
      <Icon.sparkle className="size-3" />
    </Button>
  );
}
