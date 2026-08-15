import { describe, expect, it } from 'vitest';
import { pickNext, samePick } from './pick';

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
