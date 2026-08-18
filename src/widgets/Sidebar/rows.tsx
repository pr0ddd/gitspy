import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';
import { Hint } from '@/shared/ui/tooltip';
import { Icon } from '@/shared/ui/icons';
import { ListRow } from '@/shared/ui/parts';
import type { FlatRef } from '@/entities/graph';
import type { PullView, RefView, WorktreeView } from '@/shared/api/types';
import { capped } from './views';

function Tracking({ view, onDelete }: { view: RefView; onDelete: (ref: RefView) => void }) {
  const { t } = useTranslation();
  if (view.gone && view.isHead) {
    return (
      <Hint text={t('branch.goneCurrent')}>
        <span className="text-deleted flex shrink-0 items-center" aria-label={t('branch.gone')}>
          <Icon.upstreamGone className="size-3" />
        </span>
      </Hint>
    );
  }
  if (view.gone) {
    return (
      <Hint text={t('branch.gone')}>
        <Button
          variant="ghost"
          size="icon-2xs"
          className="text-deleted hover:text-deleted shrink-0"
          aria-label={t('branch.goneDelete', { name: view.name })}
          onClick={(event) => {
            event.stopPropagation();
            onDelete(view);
          }}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <Icon.upstreamGone />
        </Button>
      </Hint>
    );
  }
  if (!view.ahead && !view.behind) return null;

  return (
    <span className="text-2xs flex shrink-0 items-center gap-1 tabular-nums">
      {view.ahead ? (
        <span className="text-ahead flex items-center">
          {capped(view.ahead)}
          <Icon.up className="size-3" />
        </span>
      ) : null}
      {view.behind ? (
        <span className="text-behind flex items-center">
          {capped(view.behind)}
          <Icon.down className="size-3" />
        </span>
      ) : null}
    </span>
  );
}

export const RefRow = memo(function RefRow({
  item,
  checkingOut,
  selected,
  tabIndex,
  onPick,
  onCheckout,
  onMenu,
  onDelete,
}: {
  item: Extract<FlatRef, { kind: 'ref' }>;
  checkingOut: string | null;
  selected: boolean;
  tabIndex: 0 | -1;
  onPick: (commit: number) => void;
  onCheckout: (ref: RefView) => void;
  onMenu: (ref: RefView) => void;
  onDelete: (ref: RefView) => void;
}) {
  const view = item.ref;
  return (
    <ListRow
      as="div"
      depth={item.depth}
      gutter={view.isHead ? <Icon.current className="text-ref-current size-3.5" /> : null}
      current={view.isHead}
      selected={selected}
      tabIndex={tabIndex}
      title={item.path === item.name ? undefined : item.path}
      onClick={() => onPick(view.commit)}
      onDoubleClick={() => onCheckout(view)}
      onContextMenu={() => onMenu(view)}
    >
      {checkingOut === view.name ? (
        <Icon.waiting className="text-faint size-3.5 shrink-0 animate-spin" />
      ) : (
        <Icon.branch className="text-faint size-3.5 shrink-0" />
      )}
      <span className="min-w-0 flex-1 truncate">{item.name}</span>
      <Tracking view={view} onDelete={onDelete} />
    </ListRow>
  );
});

export const FolderRow = memo(function FolderRow({
  item,
  selected,
  tabIndex,
  onFlip,
}: {
  item: Extract<FlatRef, { kind: 'folder' }>;
  selected: boolean;
  tabIndex: 0 | -1;
  onFlip: (path: string) => void;
}) {
  const Glyph = item.open ? Icon.open : Icon.folder;
  return (
    <ListRow
      depth={item.depth}
      gutter={null}
      selected={selected}
      tabIndex={tabIndex}
      title={item.path}
      onClick={() => onFlip(item.path)}
    >
      <Glyph className="text-faint size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{item.name}</span>
    </ListRow>
  );
});

export const TagRow = memo(function TagRow({
  view,
  selected,
  tabIndex,
  onPick,
  onMenu,
}: {
  view: RefView;
  selected: boolean;
  tabIndex: 0 | -1;
  onPick: (commit: number) => void;
  onMenu: (ref: RefView) => void;
}) {
  return (
    <ListRow
      gutter={null}
      selected={selected}
      tabIndex={tabIndex}
      onClick={() => onPick(view.commit)}
      onContextMenu={() => onMenu(view)}
    >
      <Icon.tag className="text-faint size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{view.name}</span>
    </ListRow>
  );
});

export const WorktreeRow = memo(function WorktreeRow({
  view,
  selected,
  tabIndex,
}: {
  view: WorktreeView;
  selected: boolean;
  tabIndex: 0 | -1;
}) {
  return (
    <ListRow
      gutter={view.isMain ? <Icon.current className="text-ref-current size-3.5" /> : null}
      current={view.isMain}
      selected={selected}
      tabIndex={tabIndex}
      title={view.path}
    >
      <Icon.worktree className="text-faint size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{view.name}</span>
      {view.branch ? (
        <span className="text-faint max-w-1/2 shrink truncate">{view.branch}</span>
      ) : null}
    </ListRow>
  );
});

export const pullRank = (pull: PullView): number =>
  pull.mine ? 0 : pull.assignedToMe || pull.awaitingMyReview ? 1 : 2;

export const PullRow = memo(function PullRow({
  pull,
  selected,
  tabIndex,
  onPickPull,
}: {
  pull: PullView;
  selected: boolean;
  tabIndex: 0 | -1;
  onPickPull: (pull: PullView) => void;
}) {
  return (
    <ListRow
      selected={selected}
      tabIndex={tabIndex}
      title={pull.title}
      onClick={() => onPickPull(pull)}
    >
      <Icon.pullRequest className="text-faint size-3.5 shrink-0" />
      <span className="text-faint shrink-0 tabular-nums">#{pull.number}</span>
      <span className="min-w-0 flex-1 truncate">{pull.title}</span>
    </ListRow>
  );
});
