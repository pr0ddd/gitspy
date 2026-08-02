export type SplitPath = {
  readonly directory: string;
  readonly name: string;
};

export const splitPath = (path: string): SplitPath => {
  const cut = path.lastIndexOf('/');
  return cut === -1
    ? { directory: '', name: path }
    : { directory: path.slice(0, cut + 1), name: path.slice(cut + 1) };
};

export const shortenDirectory = (directory: string, budget: number): string => {
  if (directory.length <= budget) return directory;
  if (budget <= 1) return '…';

  const tail = directory.lastIndexOf('/', directory.length - 2);
  const lastSegment = tail === -1 ? directory : directory.slice(tail);

  if (lastSegment.length + 1 >= budget) return `…${lastSegment}`;
  return `${directory.slice(0, budget - lastSegment.length - 1)}…${lastSegment}`;
};
