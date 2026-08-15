import { useTranslation } from 'react-i18next';
import { ListRow } from '@/parts';
import { relativeTime } from '@/time';
import type { FoundCommitView } from '@/types';

export function SearchResults({
  commits,
  total,
  at,
  onPick,
}: {
  commits: readonly FoundCommitView[];
  total: number;
  at: number;
  onPick: (index: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const now = Date.now() / 1000;

  return (
    <div className="bg-popover absolute top-full right-0 z-50 mt-1 w-96 rounded-md border p-1 shadow-md">
      <div className="max-h-96 overflow-y-auto">
        {commits.map((commit) => (
          <ListRow
            key={commit.hash}
            as="div"
            tall
            current={commit.index === at}
            title={commit.subject}
            onClick={() => onPick(commit.index)}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate">{commit.subject}</span>
              <span className="text-muted-foreground text-2xs flex items-center gap-1.5">
                <span className="truncate">{commit.author}</span>
                <span>·</span>
                <span className="shrink-0">{relativeTime(commit.time, now, i18n.language)}</span>
                <span>·</span>
                <span className="shrink-0 font-mono">{commit.hash.slice(0, 7)}</span>
              </span>
            </span>
          </ListRow>
        ))}
      </div>
      {total > commits.length ? (
        <p className="text-faint text-2xs px-2 py-1.5">
          {t('search.more', { count: total - commits.length })}
        </p>
      ) : null}
    </div>
  );
}
