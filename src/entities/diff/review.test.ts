import { describe, expect, it } from 'vitest';
import { parseUnifiedDiff } from './hunks';
import { reviewPieces, type ReviewGap, type ReviewLine } from './review';

const TWO_HUNKS = `@@ -10,3 +10,4 @@ fn one()
 kept one
-gone
+came
+came too
@@ -40,2 +41,2 @@ fn two()
 kept two
-old tail
+new tail
`;

const FROM_FIRST_LINE = `@@ -1,2 +1,2 @@
-was
+is
 rest
`;

const parsed = (text: string) => {
  const diff = parseUnifiedDiff(text);
  if (!diff) throw new Error('фикстура обязана разбираться');
  return diff;
};

const lines = (pieces: ReturnType<typeof reviewPieces>): ReviewLine[] =>
  pieces.filter((piece): piece is ReviewLine => piece.kind !== 'gap');

const gaps = (pieces: ReturnType<typeof reviewPieces>): ReviewGap[] =>
  pieces.filter((piece): piece is ReviewGap => piece.kind === 'gap');

describe('свиток изменений', () => {
  it('номера идут по обеим сторонам и не сбиваются на правках', () => {
    const seen = lines(reviewPieces(parsed(TWO_HUNKS), [])).map((line) => [
      line.before,
      line.after,
      line.kind,
    ]);
    expect(seen.slice(0, 4), 'у добавленной строки нет номера слева, у удалённой — справа').toEqual(
      [
        [10, 10, 'context'],
        [11, null, 'removed'],
        [null, 11, 'added'],
        [null, 12, 'added'],
      ],
    );
  });

  it('скрытое начало файла и промежуток между ханками сворачиваются', () => {
    const holes = gaps(reviewPieces(parsed(TWO_HUNKS), []));
    expect(
      holes.map((hole) => [hole.from, hole.to, hole.hidden]),
      'свёрнуто и начало файла до первой правки, и промежуток между ханками',
    ).toEqual([
      [1, 9, 9],
      [13, 39, 27],
    ]);
  });

  it('ханк от первой строки файла разрыва перед собой не заводит', () => {
    expect(
      gaps(reviewPieces(parsed(FROM_FIRST_LINE), [])),
      'скрывать нечего, когда файл начинается прямо с правки',
    ).toEqual([]);
  });

  it('раскрытый промежуток перестаёт быть разрывом, соседний остаётся', () => {
    const holes = gaps(reviewPieces(parsed(TWO_HUNKS), [{ from: 13, to: 39 }]));
    expect(
      holes.map((hole) => hole.from),
      'раскрытое человеком не сворачивается обратно, чужие промежутки не трогаются',
    ).toEqual([1]);
  });

  it('текст строки идёт без служебного знака', () => {
    const first = lines(reviewPieces(parsed(TWO_HUNKS), []))[0];
    expect(first.text, 'плюс и минус рисует интерфейс, в тексте им не место').toBe('kept one');
  });
});
