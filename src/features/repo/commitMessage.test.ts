import { describe, expect, it } from 'vitest';
import { composeCommitMessage, subjectLeft, SUBJECT_BUDGET } from './commitMessage';

describe('запас длины заголовка', () => {
  it('пустой заголовок оставляет весь бюджет — счётчик показывает, сколько ещё можно', () => {
    expect(subjectLeft('')).toBe(SUBJECT_BUDGET);
  });

  it('перебор уходит в минус, а не упирается в ноль: видно, на сколько резать', () => {
    expect(subjectLeft('x'.repeat(SUBJECT_BUDGET + 4))).toBe(-4);
  });

  it('считаются символы, а не байты — кириллица не съедает бюджет вдвое', () => {
    expect(subjectLeft('йцу')).toBe(SUBJECT_BUDGET - 3);
  });

  it('эмодзи из суррогатной пары — один символ, как его видит человек', () => {
    expect(subjectLeft('🙂')).toBe(SUBJECT_BUDGET - 1);
  });
});

describe('сборка сообщения коммита', () => {
  it('описание становится телом через пустую строку — как git склеивает два -m', () => {
    expect(composeCommitMessage('fix: thing', 'подробности\nв две строки')).toBe(
      'fix: thing\n\nподробности\nв две строки',
    );
  });

  it('пустое описание не оставляет хвоста из переводов строк', () => {
    expect(composeCommitMessage('fix: thing', '')).toBe('fix: thing');
    expect(composeCommitMessage('fix: thing', '   \n ')).toBe('fix: thing');
  });

  it('края заголовка и описания подрезаются', () => {
    expect(composeCommitMessage('  fix  ', '  body  ')).toBe('fix\n\nbody');
  });
});
