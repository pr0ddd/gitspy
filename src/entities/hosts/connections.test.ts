import { describe, expect, it } from 'vitest';
import {
  accountOf,
  connectionOf,
  EMPTY_HOSTS,
  isRejected,
  mergeNamespaces,
  namespacesKnownUpFront,
  withAccount,
  withConnections,
  withoutHost,
  withRejected,
} from './connections';

const github = { id: 'github', kind: 'github', baseUrl: 'https://github.com', login: 'pr0ddd' };
const gitlab = { id: 'gitlab', kind: 'gitlab', baseUrl: 'https://gitlab.com', login: 'pavel' };
const me = { host: 'github', login: 'pr0ddd', name: 'pr0d', avatarUrl: 'data:,' };

describe('the one place that knows which hosts are connected', () => {
  it('starts unknown and becomes loaded with the first answer, even an empty one', () => {
    expect(EMPTY_HOSTS.loaded).toBe(false);
    expect(withConnections(EMPTY_HOSTS, []).loaded).toBe(true);
  });

  it('keeps an account only while its connection exists', () => {
    let state = withAccount(withConnections(EMPTY_HOSTS, [github, gitlab]), me);
    expect(accountOf(state, 'github')).toEqual(me);

    state = withConnections(state, [gitlab]);
    expect(
      accountOf(state, 'github'),
      'a connection that went away takes its account along',
    ).toBeNull();
    expect(connectionOf(state, 'gitlab')).toEqual(gitlab);
  });

  it('disconnecting drops both the connection and the account', () => {
    const state = withoutHost(withAccount(withConnections(EMPTY_HOSTS, [github]), me), 'github');
    expect(state.connections).toEqual([]);
    expect(accountOf(state, 'github')).toBeNull();
  });
});

describe('namespaces for creating a repository', () => {
  it('the personal namespace is the login of the connection and needs no request', () => {
    expect(namespacesKnownUpFront(github)).toEqual(['pr0ddd']);
    expect(namespacesKnownUpFront(null)).toEqual([]);
  });

  it('organisations from the host are appended after it, without repeating the login', () => {
    expect(mergeNamespaces(['pr0ddd'], ['pr0ddd', 'acme', 'other'])).toEqual([
      'pr0ddd',
      'acme',
      'other',
    ]);
  });
});

describe('a host that rejected the saved sign-in', () => {
  it('is remembered as rejected until a new sign-in or a disconnect', () => {
    let state = withRejected(withAccount(withConnections(EMPTY_HOSTS, [github]), me), 'github');
    expect(isRejected(state, 'github')).toBe(true);
    expect(accountOf(state, 'github'), 'the stale account is still known, only flagged').toEqual(
      me,
    );

    state = withAccount(state, me);
    expect(isRejected(state, 'github'), 'a fresh sign-in clears the flag').toBe(false);

    state = withoutHost(withRejected(state, 'github'), 'github');
    expect(isRejected(state, 'github'), 'so does disconnecting').toBe(false);
  });
});
