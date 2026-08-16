import { describe, expect, it } from 'vitest';
import { authorsLine, authorsOf, coAuthorsOf } from './authors';
import type { RowView } from '@/shared/api/types';

const commit = (body: string, author = 'pr0d', email = 'p@example.com') =>
  ({
    kind: 'commit',
    index: 0,
    lane: 0,
    colour: 0,
    node: 0,
    hash: 'abc',
    author,
    email,
    time: 0,
    committer: author,
    committerEmail: email,
    committerTime: 0,
    subject: 's',
    body,
  }) as Extract<RowView, { kind: 'commit' }>;

describe('who a commit belongs to', () => {
  it('the author comes first, co-authors from the trailers follow in order', () => {
    const row = commit(
      'Body text\n\nCo-authored-by: Ada <ada@example.com>\nCo-authored-by: Bob <bob@example.com>\n',
    );

    expect(authorsOf(row).map((p) => p.email)).toEqual([
      'p@example.com',
      'ada@example.com',
      'bob@example.com',
    ]);
    expect(authorsLine(row)).toBe(
      'pr0d <p@example.com>, Ada <ada@example.com>, Bob <bob@example.com>',
    );
  });

  it('a trailer that repeats the author is not listed twice', () => {
    const row = commit('Co-authored-by: pr0d <P@EXAMPLE.COM>');

    expect(authorsOf(row)).toHaveLength(1);
  });

  it('the trailer is read case-insensitively and only as a whole line', () => {
    expect(coAuthorsOf('co-authored-by: X <x@y.z>')).toEqual([{ name: 'X', email: 'x@y.z' }]);
    expect(
      coAuthorsOf('see the Co-authored-by: convention <not@a.trailer> in docs'),
      'a mention inside a sentence is prose, not a trailer',
    ).toEqual([]);
  });

  it('an author without an email is shown by name alone', () => {
    expect(authorsLine(commit('', 'anon', ''))).toBe('anon');
  });
});
