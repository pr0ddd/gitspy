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

const tokensFor = (path, body, env) => {
  if (path === '/exchange' && body.host === 'github' && body.code) {
    return exchangeGithub(body.code, env);
  }
  if (path === '/exchange' && body.host === 'bitbucket' && body.code) {
    return bitbucketToken({ grant_type: 'authorization_code', code: body.code }, env);
  }
  if (path === '/refresh' && body.host === 'bitbucket' && body.refresh) {
    return bitbucketToken({ grant_type: 'refresh_token', refresh_token: body.refresh }, env);
  }
  return undefined;
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== 'POST') {
      return new Response('not found', { status: 404 });
    }

    const body = await request.json().catch(() => null);
    if (!body) return new Response('bad request', { status: 400 });

    const tokens = await tokensFor(url.pathname, body, env);
    if (tokens === undefined) return new Response('not found', { status: 404 });
    if (!tokens) return new Response('refused', { status: 401 });
    return new Response(JSON.stringify(tokens), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
