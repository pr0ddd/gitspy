import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icons';
import { InlineNote, PanelNote } from '@/shared/ui/parts';
import { HOST_LABEL, type PullsState } from '@/entities/repo';

export function PullsNote({
  state,
  onRetry,
  onConnect,
}: {
  state: Exclude<PullsState, { kind: 'ready' }>;
  onRetry: () => void;
  onConnect: () => void;
}) {
  const { t } = useTranslation();
  switch (state.kind) {
    case 'idle':
    case 'loading':
      return (
        <InlineNote>
          <Icon.waiting className="size-3 animate-spin" />
          {t('host.loading')}
        </InlineNote>
      );
    case 'noHost':
      return null;
    case 'notConnected':
      return (
        <PanelNote>
          {t('pull.notConnected', { host: HOST_LABEL[state.host] })}
          <Button size="2xs" variant="outline" className="mx-auto mt-2 flex" onClick={onConnect}>
            {t('pull.connect')}
          </Button>
        </PanelNote>
      );
    case 'failed':
      return (
        <PanelNote>
          {t('pull.failed')}
          <Button size="2xs" variant="outline" className="mx-auto mt-2 flex" onClick={onRetry}>
            {t('pull.retry')}
          </Button>
        </PanelNote>
      );
  }
}
