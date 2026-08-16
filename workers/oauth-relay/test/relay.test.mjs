import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { tokenSetOf } from '../src/index.js';

const env = {
  GITHUB_CLIENT_ID: 'gh-id',
  GITHUB_CLIENT_SECRET: 'gh-secret',
  BITBUCKET_CLIENT_ID: 'bb-id',
  BITBUCKET_CLIENT_SECRET: 'bb-secret',
};

const post = (path, body) =>
  new Request(`https://relay.example${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

test('reads the token set out of the provider response and turns junk into a refusal', () => {
  assert.deepEqual(tokenSetOf({ access_token: 'A', refresh_token: 'R', expires_in: 7200 }), {
    access: 'A',
    refresh: 'R',
    expiresIn: 7200,
  });
  assert.equal(tokenSetOf({ error: 'bad_verification_code' }), null);
});

test('the github exchange sends the secret from env and returns a token', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://github.com/login/oauth/access_token');
    const sent = JSON.parse(init.body);
    assert.equal(
      sent.client_secret,
      'gh-secret',
      'the secret lives in the worker env, not in the app',
    );
    assert.equal(sent.code, 'the-code');
    return new Response(JSON.stringify({ access_token: 'gh-token' }));
  });

  const answer = await worker.fetch(post('/exchange', { host: 'github', code: 'the-code' }), env);
  assert.equal(answer.status, 200);
  assert.equal((await answer.json()).access, 'gh-token');
});

test('the bitbucket refresh goes out with basic authorization and form data', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://bitbucket.org/site/oauth2/access_token');
    assert.match(init.headers.Authorization, /^Basic /);
    assert.match(String(init.body), /grant_type=refresh_token/);
    return new Response(JSON.stringify({ access_token: 'bb2', refresh_token: 'bbr2' }));
  });

  const answer = await worker.fetch(post('/refresh', { host: 'bitbucket', refresh: 'bbr' }), env);
  assert.equal((await answer.json()).refresh, 'bbr2');
});

test('unknown paths and verbs get a refusal rather than silence', async () => {
  const wrong = await worker.fetch(post('/exchange', { host: 'trello', code: 'x' }), env);
  assert.equal(wrong.status, 404);
  const get = await worker.fetch(new Request('https://relay.example/exchange'), env);
  assert.equal(get.status, 404);
});
