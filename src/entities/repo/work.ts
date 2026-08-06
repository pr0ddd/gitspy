import { createStore } from 'zustand/vanilla';

export type RepoWork = { kind: string; target?: string };

type WorkState = { works: ReadonlyMap<string, RepoWork> };

export const workStore = createStore<WorkState>(() => ({ works: new Map() }));

export const beginWork = (path: string, work: RepoWork): boolean => {
  const { works } = workStore.getState();
  if (works.has(path)) return false;
  const next = new Map(works);
  next.set(path, work);
  workStore.setState({ works: next });
  return true;
};

export const endWork = (path: string): void => {
  const works = new Map(workStore.getState().works);
  works.delete(path);
  workStore.setState({ works });
};
