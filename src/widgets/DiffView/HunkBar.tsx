import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';

export function CommitHunkBar({ heading, onRevert }: { heading: string; onRevert: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full items-end gap-2 border-b pb-1.5 pl-3 pr-1">
      <span className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-2xs">
        {heading}
      </span>
      <Button variant="outline" size="2xs" title={t('diff.revertHunkHint')} onClick={onRevert}>
        {t('diff.revertHunk')}
      </Button>
    </div>
  );
}

export function HunkBar({
  heading,
  staged,
  onApply,
}: {
  heading: string;
  staged: boolean;
  onApply: (cached: boolean, reverse: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full items-end gap-2 border-b pb-1.5 pl-3 pr-1">
      <span className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-2xs">
        {heading}
      </span>
      {staged ? (
        <Button variant="outlineDeleted" size="2xs" onClick={() => onApply(true, true)}>
          {t('diff.unstageHunk')}
        </Button>
      ) : (
        <>
          <Button variant="outlineDeleted" size="2xs" onClick={() => onApply(false, true)}>
            {t('diff.discardHunk')}
          </Button>
          <Button variant="outlineAdded" size="2xs" onClick={() => onApply(true, false)}>
            {t('diff.stageHunk')}
          </Button>
        </>
      )}
    </div>
  );
}
