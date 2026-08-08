const drafts = new Map<number, string>();
const watchers = new Map<number, Set<() => void>>();

export const draftOf = (id: number): string => drafts.get(id) ?? '';

export const onDraft = (id: number, changed: () => void): (() => void) => {
  const watching = watchers.get(id) ?? new Set<() => void>();
  watching.add(changed);
  watchers.set(id, watching);
  return () => {
    watching.delete(changed);
    if (watching.size === 0) watchers.delete(id);
  };
};

export const setDraft = (id: number, text: string): void => {
  drafts.set(id, text);
  watchers.get(id)?.forEach((changed) => changed());
};

export const withMentionAppended = (draft: string, mention: string): string =>
  draft === '' ? mention : `${draft} ${mention}`;

export const mentionOfFile = (path: string): string => `@${path}`;

export const mentionOfLines = (path: string, from: number, to: number): string =>
  `@${path}:${from}-${to}`;
