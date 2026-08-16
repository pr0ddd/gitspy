import { describe, expect, it } from 'vitest';
import { directoryFromUrl, shortenDirectory, splitPath } from '@/paths';

describe('path split', () => {
  it('the file name is separated from the directory', () => {
    expect(splitPath('src/shell/DiffView.tsx')).toEqual({
      directory: 'src/shell/',
      name: 'DiffView.tsx',
    });
  });

  it('a file with no directory stays a bare name', () => {
    expect(splitPath('README.md')).toEqual({ directory: '', name: 'README.md' });
  });

  it('non-ASCII letters and spaces do not break the split', () => {
    expect(splitPath('café résumé/naïve fichier.txt').name).toBe('naïve fichier.txt');
  });
});

describe('directory shortening', () => {
  it('a short directory is left as it is', () => {
    expect(shortenDirectory('src/', 40)).toBe('src/');
  });

  it('the middle is elided while the last segment stays visible', () => {
    const long = 'compiler/packages/babel-plugin-react-compiler/src/';
    const short = shortenDirectory(long, 24);
    expect(short.length).toBeLessThanOrEqual(24);
    expect(short).toContain('…');
    expect(short.endsWith('/src/')).toBe(true);
  });

  it('when there is no room even for the last segment, only that segment is left', () => {
    expect(shortenDirectory('a/b/c/very-long-last-segment/', 10).startsWith('…')).toBe(true);
  });

  it('a budget of zero neither crashes nor lengthens the string', () => {
    expect(shortenDirectory('a/b/', 0)).toBe('…');
  });
});

describe('directory name from a repository URL', () => {
  it('strips .git, because a directory is not named that way', () => {
    expect(directoryFromUrl('https://github.com/pr0ddd/gitspy.git')).toBe('gitspy');
  });

  it('understands an ssh URL where the owner is separated by a colon', () => {
    expect(directoryFromUrl('git@github.com:pr0ddd/gitspy.git')).toBe('gitspy');
  });

  it('survives a trailing slash', () => {
    expect(directoryFromUrl('https://github.com/pr0ddd/gitspy/')).toBe('gitspy');
  });
});
