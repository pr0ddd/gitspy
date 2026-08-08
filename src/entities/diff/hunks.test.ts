import { describe, expect, it } from 'vitest';
import { hiddenSpans, hunkLineRange, isGitlinkDiff, parseUnifiedDiff, patchFor } from './hunks';

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

  it('обе стороны ханка несут начало и длину — этим держится скрытие вне ханков', () => {
    const diff = parseUnifiedDiff(DIFF);
    if (!diff) throw new Error('в этом диффе есть ханки');
    expect(diff.hunks[0]).toMatchObject({ oldStart: 1, oldLines: 4, newStart: 1, newLines: 4 });
    expect(diff.hunks[1]).toMatchObject({ oldStart: 19, oldLines: 4, newStart: 19, newLines: 4 });
  });

  it('длина в единицу опускается в заголовке, но не в разборе', () => {
    const diff = parseUnifiedDiff('@@ -3 +5 @@\n-x\n+y\n');
    if (!diff) throw new Error('в этом диффе есть ханк');
    expect(diff.hunks[0]).toMatchObject({ oldStart: 3, oldLines: 1, newStart: 5, newLines: 1 });
  });
});

describe('строки ханка в новой стороне файла', () => {
  it('диапазон считается по уже разобранному ханку, а не по тексту заново', () => {
    const diff = parseUnifiedDiff(DIFF);
    if (!diff) throw new Error('в этом диффе есть ханки');
    expect(hunkLineRange(diff.hunks[1])).toEqual({ from: 19, to: 22 });
  });

  it('ханк чистого удаления не выворачивает диапазон наизнанку', () => {
    const diff = parseUnifiedDiff('@@ -3,2 +2,0 @@\n-a\n-b\n');
    if (!diff) throw new Error('в этом диффе есть ханк');
    expect(
      hunkLineRange(diff.hunks[0]),
      'конец раньше начала — это адрес, по которому агент ничего не найдёт',
    ).toEqual({ from: 2, to: 2 });
  });
});

describe('скрытие строк вне ханков', () => {
  it('прячется всё до, между и после ханков, по обеим сторонам', () => {
    const diff = parseUnifiedDiff(DIFF);
    if (!diff) throw new Error('в этом диффе есть ханки');
    expect(hiddenSpans(diff.hunks, 22, 22)).toEqual({
      original: [{ from: 5, to: 18 }],
      modified: [{ from: 5, to: 18 }],
    });
  });

  it('ханк с первой строки не рождает пустой диапазон сверху', () => {
    const diff = parseUnifiedDiff('@@ -1,2 +1,2 @@\n-a\n+b\n c\n');
    if (!diff) throw new Error('в этом диффе есть ханк');
    expect(hiddenSpans(diff.hunks, 10, 10)).toEqual({
      original: [{ from: 3, to: 10 }],
      modified: [{ from: 3, to: 10 }],
    });
  });

  it('хвост после последнего ханка прячется до конца файла каждой стороны', () => {
    const diff = parseUnifiedDiff('@@ -3,2 +3,3 @@\n x\n-a\n+b\n+c\n');
    if (!diff) throw new Error('в этом диффе есть ханк');
    expect(hiddenSpans(diff.hunks, 8, 9)).toEqual({
      original: [
        { from: 1, to: 2 },
        { from: 5, to: 8 },
      ],
      modified: [
        { from: 1, to: 2 },
        { from: 6, to: 9 },
      ],
    });
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

describe('gitlink не притворяется текстовым диффом', () => {
  it('дифф указателя на вложенный репозиторий узнаётся', () => {
    const raw = [
      'diff --git a/sandbox b/sandbox',
      'index 8677392..1eb65eb 160000',
      '--- a/sandbox',
      '+++ b/sandbox',
      '@@ -1 +1 @@',
      '-Subproject commit 8677392aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '+Subproject commit 1eb65ebbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      '',
    ].join('\n');
    expect(
      isGitlinkDiff(raw),
      'git apply не умеет класть gitlink-патчи — кнопкам ханков тут не место',
    ).toBe(true);
    expect(isGitlinkDiff('diff --git a/a.ts b/a.ts\n@@ -1 +1 @@\n-x\n+y\n')).toBe(false);
  });
});
