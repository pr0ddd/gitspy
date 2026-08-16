<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="96" height="96" alt="" />
</p>

<h1 align="center">gitspy</h1>

<p align="center">
  A desktop git client with a graph you can actually read: history on canvas,
  staging by file and by hunk, Monaco diffs, a terminal in a dock, and
  GitHub, GitLab and Bitbucket signed in — one window.
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

## What it does

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/diff-hunks.png" alt="Hunk view of a diff with stage buttons per hunk" /></td>
    <td width="50%"><img src="docs/screenshots/terminal.png" alt="The terminal dock over the graph" /></td>
  </tr>
  <tr>
    <td>Diff in hunk view — stage or discard by hunk</td>
    <td>The terminal dock over the graph</td>
  </tr>
</table>

- **The graph.** History drawn on canvas with lanes, branch and tag chips,
  author avatars and an optional minimap. Scrolling repaints on its own
  animation frame and never re-renders the interface — that is what keeps a
  million-commit repository smooth. Columns resize, hide and reorder; the
  layout is remembered.
- **Working tree.** Status with staging by file and by hunk, tree and path
  views, a commit box that can amend, and — if you point it at Ollama or LM
  Studio — a commit message written by a local model from what you staged.
- **Diff.** Monaco in inline, split and hunk views; switching files never
  jumps the line-number column. File history for any path, blame, and a
  conflict view with both sides and the merged result.
- **Branches, tags, stashes, worktrees.** A tree on the left, checkout by
  double-click, upstream and ahead/behind read from git itself, a marker on
  branches whose remote is gone. Every destructive action goes through one
  confirm bar; force push is offered only after the remote rejected an
  ordinary push, and only with lease.
- **Hosts.** Sign in to GitHub, GitLab or Bitbucket. See the repository's pull
  requests, check one out, clone from your account or create a repository on
  the host. Client ids are compiled in; secrets stay on a
  [small relay](workers/oauth-relay/README.md) that stores nothing.
- **Terminal.** A PTY dock over the graph running your login shell (PowerShell
  or cmd on Windows), with tabs for several sessions per repository.
- **Quiet by design.** No telemetry, no network request you did not ask for
  beyond the update check, the background fetch (which you can turn off) and
  avatars from a host you signed in to. Details in [SECURITY.md](SECURITY.md).

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
