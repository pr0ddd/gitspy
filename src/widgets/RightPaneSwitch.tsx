import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Icon } from '@/icons';
import { ViewBar } from '@/parts';

export type RightPane = 'graph' | 'changes';

type Props = {
  pane: RightPane;
  changes: number;
  onPane: (pane: RightPane) => void;
};

export function RightPaneSwitch({ pane, changes, onPane }: Props) {
  const { t } = useTranslation();
  return (
    <ViewBar>
      <div className="bg-fill-2 flex items-center gap-0.5 rounded-md p-0.5">
        <Button
          variant={pane === 'graph' ? 'secondary' : 'action'}
          size="2xs"
          aria-pressed={pane === 'graph'}
          onClick={() => onPane('graph')}
        >
          <Icon.commit />
          {t('pane.graph')}
        </Button>
        <Button
          variant={pane === 'changes' ? 'secondary' : 'action'}
          size="2xs"
          aria-pressed={pane === 'changes'}
          onClick={() => onPane('changes')}
        >
          <Icon.diffHunk />
          {t('pane.changes')}
          {changes > 0 ? <span className="tabular-nums">{changes}</span> : null}
        </Button>
      </div>
    </ViewBar>
  );
}
