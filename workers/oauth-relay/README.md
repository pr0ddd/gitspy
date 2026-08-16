# gitspy OAuth relay

A Cloudflare Worker that finishes the OAuth dance for GitHub and Bitbucket
on behalf of the desktop app.

## Why it exists

GitHub and Bitbucket refuse to hand out tokens without a client secret,
and a desktop binary cannot keep one. So the app performs the browser part
of the flow itself, receives the authorization code on its loopback
listener, and sends that code here. The worker holds the client secrets in
its environment, exchanges the code with the provider, and answers with the
token set. It stores nothing and logs nothing.

GitLab is not routed through the relay: it supports PKCE for public
clients, so the app talks to it directly.

## Contract

Every request is `POST` with a JSON body; anything else is `404`.

| Path        | Body                                          | Answer                                              |
|-------------|-----------------------------------------------|-----------------------------------------------------|
| `/exchange` | `{ "host": "github", "code": "…" }`           | `{ "access", "refresh", "expiresIn" }`              |
| `/exchange` | `{ "host": "bitbucket", "code": "…" }`        | same                                                |
| `/refresh`  | `{ "host": "bitbucket", "refresh": "…" }`     | same                                                |

`refresh` and `expiresIn` are `null` when the provider does not return
them (GitHub does not). A provider refusal is `401 refused`; a malformed
body is `400 bad request`.

The app-side counterpart lives in `crates/gitspy-hosts/src/relay.rs`.
`RELAY_URL` there points at the deployed worker; a fork that runs its own
relay changes that constant.

## Secrets

Set with `wrangler secret put <NAME>` — never in `wrangler.toml`:

| Name                       | Where it comes from                                    |
|----------------------------|--------------------------------------------------------|
| `GITHUB_CLIENT_ID`         | GitHub → Settings → Developer settings → OAuth Apps    |
| `GITHUB_CLIENT_SECRET`     | same app                                                |
| `BITBUCKET_CLIENT_ID`      | Bitbucket → Workspace settings → OAuth consumers        |
| `BITBUCKET_CLIENT_SECRET`  | same consumer                                           |

The GitHub OAuth App must have `http://127.0.0.1:53682/callback` as its
authorization callback URL: the worker sends the same `redirect_uri` on
exchange, and GitHub rejects a mismatch. The client ids are also compiled
into the app (`crates/gitspy-hosts/src/{github,bitbucket}.rs`) — the id is
public, the secret is not.

## Deploy and test

```bash
cd workers/oauth-relay
npx wrangler deploy
node --test
```

`wrangler.toml` carries only the worker name, entry point and
compatibility date; the account is whatever `wrangler login` is signed
into.
