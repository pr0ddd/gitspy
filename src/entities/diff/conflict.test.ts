import { describe, expect, it } from 'vitest';
import { viewForEntry } from './conflict';

describe('where a file row leads', () => {
  it('sends a conflicted row to the resolver and an ordinary one to the diff', () => {
    expect(viewForEntry('U', false)).toBe('conflict');
    expect(viewForEntry('M', false)).toBe('diff');
    expect(viewForEntry('A', true)).toBe('diff');
  });

  it('sends a staged row to the diff even when its status letter is U', () => {
    expect(
      viewForEntry('U', true),
      'after git add the index stages :2/:3 are empty, so the resolver has nothing to show',
    ).toBe('diff');
  });
});
