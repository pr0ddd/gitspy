import { useStore } from 'zustand';
import { beginWork, endWork, workStore, type RepoWork } from '@/entities/repo';
import { notifyError } from '@/toast';

export async function runRepoWork(
  path: string,
  work: RepoWork,
  perform: () => Promise<void>,
): Promise<boolean> {
  if (!beginWork(path, work)) return false;
  try {
    await perform();
    return true;
  } catch (e) {
    notifyError(e);
    return false;
  } finally {
    endWork(path);
  }
}

export const useRepoWork = (path: string | null): RepoWork | null =>
  useStore(workStore, (s) => (path === null ? null : (s.works.get(path) ?? null)));
