import { useCallback, useEffect, useState } from 'react';
import * as ipc from '@/ipc';
import { notifyError } from '@/toast';
import type { WorkingTreeView } from '@/types';

export const composeCommitMessage = (summary: string, description: string): string => {
  const head = summary.trim();
  const body = description.trim();
  return body ? `${head}\n\n${body}` : head;
};

type Wiring = {
  active: string | null;
  mergeSubject: string | null;
  busyWhile: (marker: { kind: string }, work: () => Promise<unknown>) => Promise<void>;
  reload: (path: string) => Promise<void>;
  adoptTree: (tree: WorkingTreeView) => void;
  onCommitted?: () => void;
};

export function useCommitDraft({ active, mergeSubject, busyWhile, reload, adoptTree, onCommitted }: Wiring) {
  const [message, setMessage] = useState('');
  const [description, setDescription] = useState('');
  const [amend, setAmend] = useState(false);

  useEffect(() => {
    setAmend(false);
  }, [active]);

  useEffect(() => {
    if (mergeSubject) setMessage((now) => (now.trim() ? now : mergeSubject));
  }, [mergeSubject]);

  const commit = useCallback(() => {
    if (!active || !message.trim()) return;
    void busyWhile({ kind: 'commit' }, () =>
      ipc
        .commit(active, composeCommitMessage(message, description), amend)
        .then((updated) => {
          adoptTree(updated);
          setMessage('');
          setDescription('');
          setAmend(false);
          onCommitted?.();
          return reload(active);
        })
        .catch(notifyError),
    );
  }, [active, message, description, amend, reload, busyWhile, adoptTree]);

  return { message, setMessage, description, setDescription, amend, setAmend, commit };
}
