import { describe, expect, it } from 'vitest';
import { composeCommitMessage, subjectLeft, SUBJECT_BUDGET } from './commitMessage';

describe('the subject length budget', () => {
  it('leaves the whole budget for an empty subject: the counter shows how much is still allowed', () => {
    expect(subjectLeft('')).toBe(SUBJECT_BUDGET);
  });

  it('goes negative past the budget instead of stopping at zero: it shows how much to cut', () => {
    expect(subjectLeft('x'.repeat(SUBJECT_BUDGET + 4))).toBe(-4);
  });

  it('counts characters, not bytes: non-ASCII letters do not eat the budget several times over', () => {
    expect(subjectLeft('こんに')).toBe(SUBJECT_BUDGET - 3);
  });

  it('counts an emoji built from a surrogate pair as the one character a human sees', () => {
    expect(subjectLeft('🙂')).toBe(SUBJECT_BUDGET - 1);
  });
});

describe('composing the commit message', () => {
  it('turns the description into the body after a blank line, the way git joins two -m', () => {
    expect(composeCommitMessage('fix: thing', 'details\nover two lines')).toBe(
      'fix: thing\n\ndetails\nover two lines',
    );
  });

  it('leaves no trailing newlines when the description is empty', () => {
    expect(composeCommitMessage('fix: thing', '')).toBe('fix: thing');
    expect(composeCommitMessage('fix: thing', '   \n ')).toBe('fix: thing');
  });

  it('trims the edges of both the subject and the description', () => {
    expect(composeCommitMessage('  fix  ', '  body  ')).toBe('fix\n\nbody');
  });
});
