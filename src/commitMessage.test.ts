import { describe, expect, it } from 'vitest';
import { composeCommitMessage } from './commitMessage';

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
