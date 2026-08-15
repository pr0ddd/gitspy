import { describe, expect, it } from 'vitest';
import { pickAfterMove, pickNext, samePick } from './pick';

const files = ['a.ts', 'b.ts', 'c.ts'];

describe('кого выбрать вместо ушедшего файла', () => {
  it('следующий по списку, чтобы стейдж подряд шёл без мыши', () => {
    expect(pickNext(files, 'a.ts')).toBe('b.ts');
    expect(pickNext(files, 'b.ts')).toBe('c.ts');
  });

  it('за последним ничего нет, поэтому выбор откатывается на предыдущий', () => {
    expect(pickNext(files, 'c.ts')).toBe('b.ts');
  });

  it('последний файл списка не оставляет выбора', () => {
    expect(pickNext(['a.ts'], 'a.ts')).toBe(null);
  });

  it('чужой путь ничего не выбирает', () => {
    expect(pickNext(files, 'z.ts')).toBe(null);
  });
});

describe('сравнение выбора', () => {
  it('один и тот же файл в одной секции — тот же выбор', () => {
    expect(samePick({ path: 'a.ts', staged: false }, { path: 'a.ts', staged: false })).toBe(true);
  });

  it('тот же путь в другой секции — другой выбор: это две разные строки', () => {
    expect(samePick({ path: 'a.ts', staged: false }, { path: 'a.ts', staged: true })).toBe(false);
  });

  it('пустой выбор равен пустому, иначе повторное нажатие перерисовывало бы панель', () => {
    expect(samePick(null, null)).toBe(true);
    expect(samePick(null, { path: 'a.ts', staged: false })).toBe(false);
  });
});

describe('выбор после переноса файла в другую секцию', () => {
  const unstaged = ['a.ts', 'b.ts', 'c.ts'];
  const treeAfter = (moved: string) => [
    ...unstaged.filter((p) => p !== moved).map((path) => ({ path, staged: false })),
    { path: moved, staged: true },
  ];

  it('переносится на следующий файл той же секции — стейдж подряд без мыши', () => {
    expect(pickAfterMove(unstaged, 'a.ts', false, treeAfter('a.ts'))).toEqual({
      path: 'b.ts',
      staged: false,
    });
  });

  it('следующий берётся из свежего дерева: если git его уже унёс, выбор не повисает на призраке', () => {
    const after = [
      { path: 'c.ts', staged: false },
      { path: 'a.ts', staged: true },
    ];
    expect(
      pickAfterMove(unstaged, 'a.ts', false, after),
      'b.ts исчез между командой и ответом — выбор уходит к самому файлу в новой секции',
    ).toEqual({ path: 'a.ts', staged: true });
  });

  it('последний файл секции догоняет себя в соседней секции', () => {
    expect(pickAfterMove(['a.ts'], 'a.ts', false, [{ path: 'a.ts', staged: true }])).toEqual({
      path: 'a.ts',
      staged: true,
    });
  });

  it('файл, которого после операции нет нигде, выбор снимает', () => {
    expect(pickAfterMove(['a.ts'], 'a.ts', false, [])).toBe(null);
  });
});
