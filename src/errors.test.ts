import { describe, expect, it } from 'vitest';
import { isNotOpen } from './errors';

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
