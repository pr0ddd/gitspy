import { describe, expect, it } from 'vitest';
import { parseUnifiedDiff } from './hunks';
import { reviewLines } from './review';

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

const parsed = (text: string) => {
  const diff = parseUnifiedDiff(text);
  if (!diff) throw new Error('фикстура обязана разбираться');
  return diff;
};

describe('строки свитка изменений', () => {
  it('номера идут по обеим сторонам и не сбиваются на правках', () => {
    const seen = reviewLines(parsed(TWO_HUNKS)).map((line) => [
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

  it('нумерация второго ханка начинается с его собственных чисел', () => {
    const second = reviewLines(parsed(TWO_HUNKS))[4];
    expect(
      [second.before, second.after],
      'между ханками ничего не показывается, поэтому счёт продолжается с заголовка',
    ).toEqual([40, 41]);
  });

  it('текст строки идёт без служебного знака', () => {
    expect(
      reviewLines(parsed(TWO_HUNKS))[0].text,
      'плюс и минус рисует интерфейс, в тексте им не место',
    ).toBe('kept one');
  });
});
