<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="96" height="96" alt="" />
</p>

<h1 align="center">gitspy</h1>

<p align="center">
  An open-source alternative to the reference client: the same kind of commit graph,
  staging, diffs, merge-conflict editor and host integrations — free,
  AGPL-licensed, no account, no telemetry, and native (Rust + Tauri) instead
  of a bundled browser.
</p>

<p align="center">
  <a href="https://github.com/pr0ddd/gitspy/releases/latest"><img src="https://img.shields.io/github/v/release/pr0ddd/gitspy?label=release" alt="Latest release" /></a>
  <a href="https://github.com/pr0ddd/gitspy/actions/workflows/ci.yml"><img src="https://github.com/pr0ddd/gitspy/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/pr0ddd/gitspy/releases"><img src="https://img.shields.io/github/downloads/pr0ddd/gitspy/total" alt="Downloads" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue" alt="AGPL-3.0" /></a>
</p>

<p align="center">
  <img src="docs/screenshots/graph.png" width="900" alt="gitspy: the commit graph, the working tree with staged files, and the details pane" />
</p>

## Why gitspy

- **The graph you already know how to read.** Lanes, branch and tag chips
  with leader lines, avatars, a minimap; drawn on canvas on its own animation
  frame, so a million-commit history scrolls without the interface
  re-rendering.
- **Free and yours.** AGPL-3.0. No licence key, no seat, no sign-in to use
  it, no usage data leaving your machine. Sign in to a host only if you want
  its pull requests and repositories.
- **A real merge tool.** Three Monaco editors — yours, theirs, output — with
  checkboxes per block, marks per line, syntax highlighting, synchronised
  scrolling; the output is exactly what gets saved.
- **Native and light.** Rust reads the repository (gix for objects, system
  git for state and every write, with a defused environment that can never
  prompt), Tauri hosts the interface. Installers are 20-something megabytes,
  not a browser.
- **Honest about danger.** Every destructive action — drop, hard reset,
  delete branch, discard — goes through one confirm bar; force push is
  offered only after the remote rejected an ordinary push, and only with
  lease.

## What it does

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/diff-hunks.png" alt="Hunk view of a diff with stage buttons per hunk" /></td>
    <td width="50%"><img src="docs/screenshots/conflicts.png" alt="The merge conflict editor: A, B and the output on Monaco" /></td>
  </tr>
  <tr>
    <td>Diff in hunk view — stage or discard by hunk</td>
    <td>Merge conflicts on Monaco</td>
  </tr>
</table>

- **Graph and history.** Commit search, file history for any path, blame,
  the commit's files with inline, split and hunk diffs; switching files
  never jumps the line-number column. Columns resize, hide and reorder.
- **Working tree.** Staging by file and by hunk, path and tree views, a
  commit box that can amend and push after commit — and, if you point it at
  Ollama or LM Studio, a commit message written by a local model from what
  you staged.
- **Branches, tags, stashes, worktrees.** A tree on the left, checkout by
  double-click, upstream and ahead/behind read from git itself, a marker on
  branches whose remote is gone with one-click cleanup.
- **Hosts.** GitHub, GitLab, Bitbucket: sign in, browse the repository's pull
  requests, check one out, clone from your account or create a repository on
  the host. Client ids are compiled in; the secrets stay on a
  [small relay](workers/oauth-relay/README.md) that stores nothing.
- **Terminal.** A PTY dock over the graph running your login shell
  (PowerShell or cmd on Windows), with tabs for several sessions per
  repository.
- **Updates itself** from GitHub Releases, verified against the key compiled
  into the app.

## Not there yet

Things users of other clients will look for that gitspy does not have today, so
nobody has to discover them the hard way:

- Interactive rebase and dragging branches or commits on the graph.
- Submodules and Git LFS in the interface (git itself handles them; gitspy
  shows the results).
- Commit signing and SSH key management screens.
- Issue trackers, teams, cloud patches, AI beyond the local commit message.
- A signed Windows build (SmartScreen warns until there is a certificate).

If one of these is what keeps you on the reference client, say so in an
[issue](https://github.com/pr0ddd/gitspy/issues/new/choose) — that is how
the list gets shorter.

## Download

Builds for every platform are on the
[latest release](https://github.com/pr0ddd/gitspy/releases/latest).

| Platform             | Get                                        |
| -------------------- | ------------------------------------------ |
| macOS, Apple Silicon | `gitspy_<version>_aarch64.dmg`             |
| macOS, Intel         | `gitspy_<version>_x64.dmg`                 |
| Linux                | `.AppImage`, `.deb` or `.rpm`              |
| Windows              | `gitspy_<version>_x64-setup.exe` or `.msi` |

macOS builds are signed and notarised. The Windows build is not signed yet, so
SmartScreen warns on first start — that is the missing certificate, not the
app. Once installed, gitspy updates itself: it reads `latest.json` from the
releases page, downloads the new version in the background and offers a
restart in the bottom bar.

## Status

gitspy was built and used daily on macOS; the Linux and Windows builds ship
from the same source through CI and have had far less time in front of
people. Please [report](https://github.com/pr0ddd/gitspy/issues/new/choose)
what you hit — the terminal output of the same git operation helps most.

## Build from source

Rust 1.85+, Node 22+, and on Linux the Tauri system packages
(`libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
libxdo-dev libssl-dev patchelf`).

```bash
npm ci
npm run app                    # the app in development mode
npm run build                  # every frontend gate + the bundle
cargo test                     # every Rust test
cargo clippy --all-targets -- -D warnings
npm run tauri build            # installers for the platform you are on
```

## How it is put together

| Crate / directory     | Role                                                                        |
| --------------------- | --------------------------------------------------------------------------- |
| `crates/gitspy-core`  | Graph layout: topology to lanes, colours and segments; knows nothing of git |
| `crates/gitspy-repo`  | Reads objects through gix: walk order, parents, commit metadata             |
| `crates/gitspy-exec`  | Runs system git with a defused environment; every write and all state       |
| `crates/gitspy-hosts` | GitHub, GitLab, Bitbucket behind one `Host` enum                            |
| `crates/gitspy-term`  | PTY sessions                                                                |
| `crates/gitspy-ai`    | Local-model commit messages                                                 |
| `src-tauri`           | The boundary: Tauri commands, open repositories, watchers                   |
| `src`                 | Canvas rendering, panels, interaction — Feature-Sliced Design layers        |

The rules the code follows — no comments, tests before fixes, one set of
theme tokens, everything user-visible through i18n — are in
[CLAUDE.md](CLAUDE.md), which is also the contract for contributions; the
short version is [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

gitspy is free software under the
[GNU Affero General Public License v3.0](LICENSE). Dependencies are held to a
permissive-only policy in CI (`deny.toml`, `npm run licenses:check`).
