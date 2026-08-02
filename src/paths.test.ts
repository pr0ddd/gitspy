import { describe, expect, it } from 'vitest';
import { shortenDirectory, splitPath } from './paths';

describe('разбор пути', () => {
  it('имя файла отделяется от каталога', () => {
    expect(splitPath('src/shell/DiffView.tsx')).toEqual({
      directory: 'src/shell/',
      name: 'DiffView.tsx',
    });
  });

  it('файл без каталога остаётся именем', () => {
    expect(splitPath('README.md')).toEqual({ directory: '', name: 'README.md' });
  });

  it('кириллица и пробелы не ломают разбор', () => {
    expect(splitPath('папка с пробелами/файл.txt').name).toBe('файл.txt');
  });
});

describe('сокращение каталога', () => {
  it('короткий каталог остаётся как есть', () => {
    expect(shortenDirectory('src/', 40)).toBe('src/');
  });

  it('сокращается середина, а последний сегмент остаётся виден', () => {
    const long = 'compiler/packages/babel-plugin-react-compiler/src/';
    const short = shortenDirectory(long, 24);
    expect(short.length).toBeLessThanOrEqual(24);
    expect(short).toContain('…');
    expect(short.endsWith('/src/')).toBe(true);
  });

  it('когда места нет даже на последний сегмент, остаётся он один', () => {
    expect(shortenDirectory('a/b/c/очень-длинный-сегмент/', 10).startsWith('…')).toBe(true);
  });

  it('нулевой запас не роняет и не удлиняет', () => {
    expect(shortenDirectory('a/b/', 0)).toBe('…');
  });
});
