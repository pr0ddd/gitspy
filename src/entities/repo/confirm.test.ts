import { describe, expect, it } from 'vitest';
import { confirmationOf, isDangerous, isDangerousPath } from './confirm';

describe('which operations ask first', () => {
  it('names the destructive ones and nothing else', () => {
    expect(isDangerous({ kind: 'branchDelete', name: 'x' })).toBe(true);
    expect(isDangerous({ kind: 'pushDelete', remote: 'origin', branch: 'x' })).toBe(true);
    expect(isDangerous({ kind: 'drop', hash: 'abc' })).toBe(true);
    expect(isDangerous({ kind: 'reset', hash: 'abc', mode: 'hard' })).toBe(true);
    expect(isDangerous({ kind: 'discardAll' })).toBe(true);

    expect(isDangerous({ kind: 'reset', hash: 'abc', mode: 'soft' }), 'soft keeps the work').toBe(
      false,
    );
    expect(isDangerous({ kind: 'reset', hash: 'abc', mode: 'mixed' })).toBe(false);
    expect(isDangerous({ kind: 'push' }), 'an ordinary push cannot lose anything').toBe(false);
    expect(isDangerous({ kind: 'merge', branch: 'x' })).toBe(false);
    expect(isDangerous({ kind: 'cherryPick', hash: 'abc' })).toBe(false);
  });

  it('on paths only discard is destructive', () => {
    expect(isDangerousPath({ kind: 'discard', paths: ['a'] })).toBe(true);
    expect(isDangerousPath({ kind: 'stage', paths: ['a'] })).toBe(false);
    expect(isDangerousPath({ kind: 'unstage', paths: ['a'] })).toBe(false);
    expect(isDangerousPath({ kind: 'stageAll' })).toBe(false);
  });
});

describe('the text of a confirmation', () => {
  it('a destructive operation gets one red choice that runs it, with the subject as a parameter', () => {
    const text = confirmationOf({
      kind: 'operation',
      operation: { kind: 'branchDelete', name: 'feature' },
    });

    expect(text.message).toBe('confirm.branchDelete');
    expect(text.params).toEqual({ name: 'feature' });
    expect(text.choices).toEqual([
      {
        label: 'confirm.branchDeleteAction',
        tone: 'destructive',
        effect: { kind: 'run', operation: { kind: 'branchDelete', name: 'feature' } },
      },
    ]);
  });

  it('a hash is shortened for the eye, the operation keeps the full one', () => {
    const text = confirmationOf({
      kind: 'operation',
      operation: { kind: 'drop', hash: 'abcdef0123456789' },
    });

    expect(text.params).toEqual({ hash: 'abcdef01' });
    expect(text.choices[0].effect).toEqual({
      kind: 'run',
      operation: { kind: 'drop', hash: 'abcdef0123456789' },
    });
  });

  it('discarding one path names it, discarding several counts them', () => {
    expect(
      confirmationOf({ kind: 'pathOperation', operation: { kind: 'discard', paths: ['a.ts'] } }),
    ).toMatchObject({ message: 'confirm.discard', params: { path: 'a.ts' } });
    expect(
      confirmationOf({
        kind: 'pathOperation',
        operation: { kind: 'discard', paths: ['a.ts', 'b.ts'] },
      }),
    ).toMatchObject({ message: 'confirm.discardMany', params: { count: '2' } });
  });

  it('deleting a file from disk is its own effect: it is not a git operation', () => {
    const text = confirmationOf({ kind: 'deleteFile', path: 'notes.txt' });

    expect(text.choices[0].effect).toEqual({ kind: 'deleteFile', path: 'notes.txt' });
    expect(text.choices[0].tone).toBe('destructive');
  });

  it('a rejected push offers two ways out: pull, or force with lease', () => {
    const text = confirmationOf({ kind: 'pushRejected', branch: 'main', upstream: 'origin/main' });

    expect(text.message).toBe('confirm.pushRejected');
    expect(text.params).toEqual({ branch: 'main', upstream: 'origin/main' });
    expect(text.choices.map((c) => [c.tone, c.effect])).toEqual([
      ['default', { kind: 'run', operation: { kind: 'pull' } }],
      ['destructive', { kind: 'run', operation: { kind: 'pushForceWithLease' } }],
    ]);
  });

  it('without a known upstream the message says so rather than printing an empty name', () => {
    expect(confirmationOf({ kind: 'pushRejected', branch: 'main', upstream: null }).message).toBe(
      'confirm.pushRejectedNoUpstream',
    );
  });

  it('refuses to describe an operation that never needed asking: that would hide a routing bug', () => {
    expect(() => confirmationOf({ kind: 'operation', operation: { kind: 'fetch' } })).toThrow(
      /needs no confirmation/,
    );
  });
});
