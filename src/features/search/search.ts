import { useCallback, useEffect, useState } from 'react';
import * as ipc from '@/ipc';
import { notifyError } from '@/toast';

const SETTLE_MS = 200;

export type CommitSearch = {
  readonly query: string;
  readonly found: number[];
  readonly at: number;
  readonly setQuery: (query: string) => void;
  readonly step: (delta: number) => void;
};

export function useCommitSearch(
  repo: string | null,
  version: number,
  onHit: (index: number) => void,
): CommitSearch {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<number[]>([]);
  const [at, setAt] = useState(0);

  useEffect(() => {
    if (!repo || !query.trim()) {
      setFound([]);
      setAt(0);
      return;
    }

    let alive = true;
    const timer = setTimeout(() => {
      ipc
        .searchCommits(repo, query)
        .then((hits) => {
          if (!alive) return;
          setFound(hits);
          setAt(0);
          if (hits.length) onHit(hits[0]);
        })
        .catch(notifyError);
    }, SETTLE_MS);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [repo, query, version, onHit]);

  const step = useCallback(
    (delta: number) => {
      if (!found.length) return;
      const next = (at + delta + found.length) % found.length;
      setAt(next);
      onHit(found[next]);
    },
    [found, at, onHit],
  );

  return { query, found, at, setQuery, step };
}
