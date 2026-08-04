import { describe, expect, it } from 'vitest';
import { parseUnifiedDiff, patchFor } from './hunks';

const DIFF = [
  'diff --git a/code.txt b/code.txt',
  'index f028205..9a717e2 100644',
  '--- a/code.txt',
  '+++ b/code.txt',
  '@@ -1,4 +1,4 @@',
  '-top old',
  '+top new',
  ' line 1',
  ' line 2',
  ' line 3',
  '@@ -19,4 +19,4 @@ line 17',
  ' line 18',
  ' line 19',
  ' line 20',
  '-bottom old',
  '+bottom new',
  '',
].join('\n');

describe('разбор настоящего git diff на ханки', () => {
  it('дифф распадается на заголовок файла и два ханка с позициями', () => {
    const diff = parseUnifiedDiff(DIFF);
    if (!diff) throw new Error('в этом диффе есть ханки');
    expect(diff.hunks.length).toBe(2);
    expect(diff.hunks[0].heading).toBe('@@ -1,4 +1,4 @@');
    expect(diff.hunks[1].heading).toBe('@@ -19,4 +19,4 @@ line 17');
    expect(diff.hunks[0].newStart, 'позиция нужна, чтобы поставить кнопки на строку').toBe(1);
    expect(diff.hunks[1].newStart).toBe(19);
  });

  it('пустой дифф — это отсутствие ханков, а не пустой список', () => {
    expect(parseUnifiedDiff('')).toBeNull();
  });

  it('мини-патч одного ханка — байт в байт кусок исходного диффа', () => {
    const diff = parseUnifiedDiff(DIFF);
    if (!diff) throw new Error('в этом диффе есть ханки');
    expect(
      patchFor(diff, diff.hunks[1]),
      'git apply строг к байтам — патч склеивается из подстрок оригинала, не пересобирается',
    ).toBe(
      [
        'diff --git a/code.txt b/code.txt',
        'index f028205..9a717e2 100644',
        '--- a/code.txt',
        '+++ b/code.txt',
        '@@ -19,4 +19,4 @@ line 17',
        ' line 18',
        ' line 19',
        ' line 20',
        '-bottom old',
        '+bottom new',
        '',
      ].join('\n'),
    );
  });
});
