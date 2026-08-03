import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import { describeError, isNotOpen } from './errors';

const echo = ((key: string) => key) as unknown as TFunction<'errors'>;

describe('подробность ошибки git', () => {
  it('стена hint-ов сжимается до строк с сутью', () => {
    const detail =
      'hint: You have divergent branches and need to specify how to reconcile them.\n' +
      'hint: git config pull.rebase false  # merge\n' +
      'hint: git config pull.rebase true   # rebase\n' +
      'fatal: Need to specify how to reconcile divergent branches.';
    expect(
      describeError({ code: 'exec.failed', params: {}, detail }, echo).detail,
      'строки hint: — советы для терминала, в тосте они шум',
    ).toBe('fatal: Need to specify how to reconcile divergent branches.');
  });

  it('подробность из одних hint-ов не превращается в пустоту', () => {
    const detail = 'hint: Updates were rejected because the remote contains work';
    expect(
      describeError({ code: 'exec.failed', params: {}, detail }, echo).detail,
      'лучше сырой hint, чем ошибка вовсе без подробности',
    ).toBe(detail);
  });
});

describe('расхождение состояния с бэкендом', () => {
  it('«репозиторий не открыт» узнаётся, чтобы переоткрыть, а не показать ошибку', () => {
    expect(isNotOpen({ code: 'repo.notOpen', params: { path: '/r' } })).toBe(true);
  });

  it('остальные ошибки остаются ошибками', () => {
    expect(isNotOpen({ code: 'exec.failed', params: {} })).toBe(false);
    expect(isNotOpen(new Error('что угодно'))).toBe(false);
    expect(isNotOpen(null)).toBe(false);
  });
});
