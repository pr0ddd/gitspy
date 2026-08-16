export function tokenSetOf(raw) {
  if (!raw.access_token) return null;
  return {
    access: raw.access_token,
    refresh: raw.refresh_token ?? null,
    expiresIn: raw.expires_in ?? null,
  };
}

async function exchangeGithub(code, env) {
  const answer = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: 'http://127.0.0.1:53682/callback',
    }),
  });
  return tokenSetOf(await answer.json());
}

async function bitbucketToken(form, env) {
  const basic = btoa(`${env.BITBUCKET_CLIENT_ID}:${env.BITBUCKET_CLIENT_SECRET}`);
  const answer = await fetch('https://bitbucket.org/site/oauth2/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(form),
  });
  return tokenSetOf(await answer.json());
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== 'POST') {
      return new Response('not found', { status: 404 });
    }

    const body = await request.json().catch(() => null);
    if (!body) return new Response('bad request', { status: 400 });

    let tokens = null;
    if (url.pathname === '/exchange' && body.host === 'github' && body.code) {
      tokens = await exchangeGithub(body.code, env);
    } else if (url.pathname === '/exchange' && body.host === 'bitbucket' && body.code) {
      tokens = await bitbucketToken({ grant_type: 'authorization_code', code: body.code }, env);
    } else if (url.pathname === '/refresh' && body.host === 'bitbucket' && body.refresh) {
      tokens = await bitbucketToken(
        { grant_type: 'refresh_token', refresh_token: body.refresh },
        env,
      );
    } else {
      return new Response('not found', { status: 404 });
    }

    if (!tokens) return new Response('refused', { status: 401 });
    return new Response(JSON.stringify(tokens), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
