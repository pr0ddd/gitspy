import { useCallback, useEffect, useState } from 'react';
import * as ipc from '@/ipc';
import { notifyError } from '@/toast';
import { runRepoWork } from './repoWork';
import { usePref } from '@/prefs';
import { AI_DEFAULT_URLS, SETTINGS } from '@/settingsModel';
import type { AiProviderId, WorkingTreeView } from '@/types';

export const SUBJECT_BUDGET = 72;

export const subjectLeft = (summary: string): number => SUBJECT_BUDGET - [...summary].length;

export const composeCommitMessage = (summary: string, description: string): string => {
  const head = summary.trim();
  const body = description.trim();
  return body ? `${head}\n\n${body}` : head;
};

type Wiring = {
  active: string | null;
  mergeSubject: string | null;
  reload: (path: string) => Promise<void>;
  adoptTree: (tree: WorkingTreeView) => void;
  onCommitted?: () => void;
};

export function useCommitDraft({ active, mergeSubject, reload, adoptTree, onCommitted }: Wiring) {
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
    void runRepoWork(active, { kind: 'commit' }, () =>
      ipc.commit(active, composeCommitMessage(message, description), amend).then((updated) => {
        adoptTree(updated);
        setMessage('');
        setDescription('');
        setAmend(false);
        return reload(active);
      }),
    ).then((committed) => {
      if (committed) onCommitted?.();
    });
  }, [active, message, description, amend, reload, adoptTree, onCommitted]);

  return { message, setMessage, description, setDescription, amend, setAmend, commit };
}

export type GenerateReadiness = 'ready' | 'needsStaged' | 'needsSetup';

export function useGenerateCommit({
  repo,
  hasStaged,
  onDraft,
}: {
  repo: string;
  hasStaged: boolean;
  onDraft: (summary: string, description: string) => void;
}) {
  const [provider] = usePref<AiProviderId>(SETTINGS.aiProvider, 'ollama');
  const [baseUrl] = usePref<string>(SETTINGS.aiBaseUrl, '');
  const [model] = usePref<string>(SETTINGS.aiModel, '');
  const [generating, setGenerating] = useState(false);

  const readiness: GenerateReadiness = !model ? 'needsSetup' : !hasStaged ? 'needsStaged' : 'ready';

  const generate = useCallback(() => {
    if (readiness !== 'ready' || generating) return;
    setGenerating(true);
    ipc
      .aiGenerateCommit(repo, baseUrl.trim() || AI_DEFAULT_URLS[provider], model)
      .then((draft) => onDraft(draft.summary, draft.description))
      .catch(notifyError)
      .finally(() => setGenerating(false));
  }, [readiness, generating, repo, provider, baseUrl, model, onDraft]);

  return { readiness, generating, generate };
}
