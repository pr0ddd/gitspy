# gitspy

A desktop git client: the commit graph, a working tree with staging, a diff on
Monaco, conflicts side by side, a terminal in a dock, and GitHub, GitLab and
Bitbucket signed in — one window, no browser tabs. Tauri 2 on the outside,
Rust and system git on the inside, React and canvas in the middle.

## Download

Every release ships from [GitHub Releases](https://github.com/pr0ddd/gitspy/releases):

| Platform             | File                           |
| -------------------- | ------------------------------ |
| macOS, Apple Silicon | `gitspy_<version>_aarch64.dmg` |
| macOS, Intel         | `gitspy_<version>_x64.dmg`     |
| Linux                | `.AppImage`, `.deb`, `.rpm`    |
| Windows              | `-setup.exe` (NSIS) or `.msi`  |

The macOS builds are signed and notarised. The Windows build is not signed
yet, so SmartScreen will warn on first start — that is the missing
certificate, not the app. Once installed, gitspy updates itself: it checks
`latest.json` on the releases page, downloads the new version in the
background and offers a restart in the bottom bar.

## What it does

- **Graph.** History drawn on canvas with lanes, branch and tag chips, avatars
  and a minimap; scrolling repaints on its own animation frame and never
  re-renders the interface, which is what keeps a million-commit repository
  smooth. Columns can be resized, hidden and reordered.
- **Working tree.** Status with staging by file and by hunk, a commit box that
  can amend, and — if you point it at Ollama or LM Studio — a commit message
  written by a local model from what you staged.
- **Diff.** Monaco in inline, split and hunk views, file history for any path,
  blame, and a conflict view with both sides and the merged result.
- **Branches, tags, stashes, worktrees.** A tree on the left, checkout by
  double-click, every destructive action behind a confirm bar, force push only
  when the remote rejected an ordinary one, and only with lease.
- **Hosts.** Sign in to GitHub, GitLab or Bitbucket; see the repository's pull
  requests, check one out, clone from your account or create a repository on
  the host. Client ids are compiled in; secrets stay on a
  [small relay](workers/oauth-relay/README.md).
- **Terminal.** A PTY dock over the graph running your login shell (PowerShell
  or cmd on Windows), with a fullscreen layout that puts the shell next to the
  graph or the diff.

## Build from source

You need Rust 1.85+, Node 22+, and on Linux the Tauri system packages
(`libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
libxdo-dev libssl-dev patchelf`).

```bash
npm ci
npm run app                    # the app in development mode
npm run build                  # every frontend gate + the bundle
cargo test                     # every Rust test
cargo clippy --all-targets -- -D warnings
```

`npm run tauri build` produces the installers for the platform you are on.

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
theme tokens, everything user-visible through i18n — are written down in
[CLAUDE.md](CLAUDE.md), which is also the contract for contributions; see
[CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

gitspy is free software under the
[GNU Affero General Public License v3.0](LICENSE). Dependencies are checked
against a permissive-only policy in CI (`deny.toml`, `npm run licenses:check`).
