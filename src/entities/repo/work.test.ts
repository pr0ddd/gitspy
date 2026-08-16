import { beforeEach, describe, expect, it } from 'vitest';
import { beginWork, endWork, workStore } from './work';

beforeEach(() => workStore.setState({ works: new Map() }));

describe('the operation lane of a repository', () => {
  it('operations in different repositories do not disturb one another', () => {
    expect(beginWork('/a', { kind: 'push' })).toBe(true);
    expect(beginWork('/b', { kind: 'pull' })).toBe(true);
    expect(workStore.getState().works.get('/a')).toEqual({ kind: 'push' });
    expect(workStore.getState().works.get('/b')).toEqual({ kind: 'pull' });
  });

  it('a second start in the same repository is rejected and does not overwrite the running operation', () => {
    beginWork('/a', { kind: 'push' });
    expect(beginWork('/a', { kind: 'pull' })).toBe(false);
    expect(workStore.getState().works.get('/a')).toEqual({ kind: 'push' });
  });

  it('after completion the lane is free for the next job', () => {
    beginWork('/a', { kind: 'push' });
    endWork('/a');
    expect(beginWork('/a', { kind: 'pull' })).toBe(true);
  });
});
