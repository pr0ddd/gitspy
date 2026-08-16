export const viewForEntry = (letter: string, staged: boolean): 'conflict' | 'diff' =>
  letter === 'U' && !staged ? 'conflict' : 'diff';
