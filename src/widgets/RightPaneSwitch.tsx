import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ViewBar } from '@/parts';

export type RightPane = 'graph' | 'changes';

type Props = {
  pane: RightPane;
  changes: number;
  context: string | null;
  onPane: (pane: RightPane) => void;
};

export function RightPaneSwitch({ pane, changes, context, onPane }: Props) {
  const { t } = useTranslation();
  return (
    <ViewBar>
      <Button
        variant={pane === 'graph' ? 'secondary' : 'action'}
        size="2xs"
        aria-pressed={pane === 'graph'}
        onClick={() => onPane('graph')}
      >
        {t('pane.graph')}
      </Button>
      <Button
        variant={pane === 'changes' ? 'secondary' : 'action'}
        size="2xs"
        aria-pressed={pane === 'changes'}
        onClick={() => onPane('changes')}
      >
        {t('pane.changes')}
        {changes > 0 ? <span className="tabular-nums">{changes}</span> : null}
      </Button>
      {context ? (
        <span className="text-muted-foreground min-w-0 flex-1 truncate">{context}</span>
      ) : null}
    </ViewBar>
  );
}
