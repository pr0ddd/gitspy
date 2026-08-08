import { describe, expect, it, vi } from 'vitest';
import { draftOf, mentionOfFile, mentionOfLines, onDraft, setDraft } from './draft';

describe('черновик агентской сессии', () => {
  it('черновик копится по сессиям и не течёт между ними', () => {
    setDraft(1, '@a.ts:1-5');
    setDraft(2, '@b.ts');
    expect(draftOf(1)).toBe('@a.ts:1-5');
    expect(draftOf(2)).toBe('@b.ts');
  });

  it('подписка узнаёт о новом черновике', () => {
    const seen = vi.fn();
    const stop = onDraft(3, seen);
    setDraft(3, '@c.ts');
    expect(seen, 'без уведомления поле ввода осталось бы пустым').toHaveBeenCalledTimes(1);
    stop();
    setDraft(3, '@d.ts');
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('сессия без черновика отдаёт пустую строку', () => {
    expect(draftOf(4), 'поле ввода читает строку, а не undefined').toBe('');
  });

  it('упоминание файла — путь от корня репозитория', () => {
    expect(mentionOfFile('src/a.ts')).toBe('@src/a.ts');
  });

  it('упоминание ханка называет строки, а не пересказывает диф', () => {
    expect(
      mentionOfLines('src/a.ts', 10, 20),
      'агент прочитает файл сам, ему нужен адрес',
    ).toBe('@src/a.ts:10-20');
  });
});
