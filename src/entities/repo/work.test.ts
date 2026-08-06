import { beforeEach, describe, expect, it } from 'vitest';
import { beginWork, endWork, workStore } from './work';

beforeEach(() => workStore.setState({ works: new Map() }));

describe('полоса работ репозитория', () => {
  it('работы в разных репозиториях не мешают друг другу', () => {
    expect(beginWork('/a', { kind: 'push' })).toBe(true);
    expect(beginWork('/b', { kind: 'pull' })).toBe(true);
    expect(workStore.getState().works.get('/a')).toEqual({ kind: 'push' });
    expect(workStore.getState().works.get('/b')).toEqual({ kind: 'pull' });
  });

  it('двойной старт в одном репозитории отвергается и не затирает текущую работу', () => {
    beginWork('/a', { kind: 'push' });
    expect(beginWork('/a', { kind: 'pull' })).toBe(false);
    expect(workStore.getState().works.get('/a')).toEqual({ kind: 'push' });
  });

  it('после завершения полоса свободна для следующей работы', () => {
    beginWork('/a', { kind: 'push' });
    endWork('/a');
    expect(beginWork('/a', { kind: 'pull' })).toBe(true);
  });
});
