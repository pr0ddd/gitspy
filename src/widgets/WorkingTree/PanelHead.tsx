import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';
import { Hint } from '@/shared/ui/tooltip';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';
import { Icon } from '@/shared/ui/icons';
import { Chip, PanelBar } from '@/shared/ui/parts';
import type { FileView } from './order';

export function PanelHead({
  count,
  branch,
  merging,
  busy,
  view,
  descending,
  allClosed,
  onDiscardAll,
  onView,
  onOrder,
  onFoldAll,
}: {
  count: number;
  branch: string | null;
  merging: string | null;
  busy: boolean;
  view: FileView;
  descending: boolean;
  allClosed: boolean;
  onDiscardAll: () => void;
  onView: (next: FileView) => void;
  onOrder: (descending: boolean) => void;
  onFoldAll: (unfold: boolean) => void;
}) {
  const { t } = useTranslation();
  const Sort = descending ? Icon.sortZA : Icon.sortAZ;

  return (
    <>
      <PanelBar>
        <Hint text={t('workingTree.discardAll')}>
          <Button
            variant="destructiveSoft"
            size="icon-xs"
            aria-label={t('workingTree.discardAll')}
            disabled={busy || count === 0}
            onClick={onDiscardAll}
          >
            <Icon.discard className="size-3" />
          </Button>
        </Hint>
        <span className="text-muted-foreground flex min-w-0 flex-1 items-center justify-center gap-1.5">
          {merging ? (
            <>
              <span className="shrink-0">{t('workingTree.merging')}</span>
              <Chip filled title={merging}>
                <span className="truncate">{merging}</span>
              </Chip>
              <span className="shrink-0">{t('workingTree.into')}</span>
              {branch ? (
                <Chip filled="current" title={branch}>
                  <span className="truncate">{branch}</span>
                </Chip>
              ) : null}
            </>
          ) : (
            <>
              <span className="truncate">{t('workingTree.changesOn', { count })}</span>
              {branch ? (
                <Chip filled title={branch}>
                  <span className="truncate">{branch}</span>
                </Chip>
              ) : null}
            </>
          )}
        </span>
      </PanelBar>

      <PanelBar className="my-1 border-t-0">
        <span className="flex flex-1 items-center">
          <Hint text={t(descending ? 'workingTree.sortZA' : 'workingTree.sortAZ')}>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t(descending ? 'workingTree.sortZA' : 'workingTree.sortAZ')}
              onClick={() => onOrder(!descending)}
            >
              <Sort className="size-3.5" />
            </Button>
          </Hint>
        </span>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={view}
          onValueChange={(next) => {
            if (next) onView(next as FileView);
          }}
        >
          <ToggleGroupItem value="path">
            <Icon.viewPath />
            {t('workingTree.viewPath')}
          </ToggleGroupItem>
          <ToggleGroupItem value="tree">
            <Icon.viewTree />
            {t('workingTree.viewTree')}
          </ToggleGroupItem>
        </ToggleGroup>
        <span className="flex flex-1 items-center justify-end">
          {view === 'tree' ? (
            <Button variant="action" size="xs" onClick={() => onFoldAll(allClosed)}>
              {t(allClosed ? 'workingTree.expandAll' : 'workingTree.collapseAll')}
            </Button>
          ) : null}
        </span>
      </PanelBar>
    </>
  );
}
