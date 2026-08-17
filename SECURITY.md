# Security

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private reporting:
<https://github.com/pr0ddd/gitspy/security/advisories/new>. You will get an
acknowledgement within a few days, and a fix or a decision as soon as the
problem is understood; releases with security fixes say so in the changelog.

## What gitspy touches

- **Your repositories** through system git and gix, in the directories you
  open. Every git process runs with a defused environment: no terminal
  prompts, no editor, no pager, credential requests routed to the app,
  `BatchMode=yes` for ssh.
- **Host tokens** for GitHub, GitLab and Bitbucket, kept as plain files in the
  app data directory: mode 600 on macOS and Linux, and inside your own
  `%APPDATA%` profile on Windows with the permissions Windows gives it. They
  are not encrypted — anything running as you can read them. Client secrets
  never ship in the app;
  the OAuth code is exchanged by a
  [small relay](workers/oauth-relay/README.md) that stores nothing.
- **Updates** downloaded from GitHub Releases and verified against the public
  key compiled into the app before they are installed.
- **A local model**, only if you configure one; the diff you staged is sent to
  the address you entered and nowhere else.

gitspy has no telemetry. Apart from what you ask it to do, it talks to the
network for three things: the update check, the background fetch (which you
can turn off in Settings), and commit-author avatars from a host you have
signed in to.

## Supported versions

Only the latest release receives fixes; the updater takes you there.
