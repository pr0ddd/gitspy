<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="96" height="96" alt="" />
</p>

<h1 align="center">gitspy</h1>

<p align="center">
  A free, open-source alternative to the reference client.<br />
  Commit graph, staging, diffs, a merge conflict editor and GitHub / GitLab / Bitbucket sign-in — in a native app.
</p>

<p align="center">
  <a href="https://github.com/pr0ddd/gitspy/releases/latest"><img src="https://img.shields.io/github/v/release/pr0ddd/gitspy?label=release" alt="Latest release" /></a>
  <a href="https://github.com/pr0ddd/gitspy/actions/workflows/ci.yml"><img src="https://github.com/pr0ddd/gitspy/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/pr0ddd/gitspy/releases"><img src="https://img.shields.io/github/downloads/pr0ddd/gitspy/total" alt="Downloads" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue" alt="AGPL-3.0" /></a>
</p>

<p align="center">
  <img src="docs/screenshots/graph.png" width="900" alt="gitspy showing a commit graph, the working tree and commit details" />
</p>

## Why gitspy

- **Free.** No licence, no seat, no account. AGPL-3.0.
- **Private.** No telemetry. The app talks to the network only when you ask it
  to (and to check for updates).
- **Fast.** Written in Rust and Tauri, not a bundled browser. Repositories with
  hundreds of thousands of commits open and scroll smoothly.
- **The graph you know.** Branch and tag labels on the commits, avatars, a
  minimap, resizable columns — the layout users of other clients are used to.
- **A proper merge tool.** Yours, theirs and the result side by side, with
  syntax highlighting; pick whole blocks or single lines, edit the result by
  hand, save.
- **Safe by default.** Every destructive action asks first. Force push is
  offered only after a normal push was rejected, and only with `--force-with-lease`.

## Not there yet

What users of other clients will look for that gitspy does not have today:

- Interactive rebase; dragging branches or commits on the graph.
- Submodule and Git LFS screens (git handles them, gitspy just shows the
  result).
- Commit signing and SSH key management.
- Issue trackers, teams, cloud patches, AI beyond the local commit message.
- A signed Windows build (SmartScreen warns until there is a certificate).

If one of these is why you stay on the reference client,
[open an issue](https://github.com/pr0ddd/gitspy/issues/new/choose) — that
is how the list gets shorter.

## Download

Get the [latest release](https://github.com/pr0ddd/gitspy/releases/latest):

| Platform             | File                                       |
| -------------------- | ------------------------------------------ |
| macOS, Apple Silicon | `gitspy_<version>_aarch64.dmg`             |
| macOS, Intel         | `gitspy_<version>_x64.dmg`                 |
| Linux                | `.AppImage`, `.deb` or `.rpm`              |
| Windows              | `gitspy_<version>_x64-setup.exe` or `.msi` |

macOS builds are signed and notarised. The Windows build is not signed yet, so
SmartScreen will warn once. Updates arrive on their own: the app downloads a
new version in the background and offers a restart.

## Status

gitspy has been used daily on macOS for a while. The Linux and Windows builds
come from the same code but have had far less use — please
[report](https://github.com/pr0ddd/gitspy/issues/new/choose) anything odd; the
output of the same git command in a terminal helps most.

## Build from source

You need Rust 1.85+, Node 22+, and on Linux the Tauri packages
(`libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libxdo-dev libssl-dev patchelf`).

```bash
npm ci
npm run app            # run in development mode
npm run tauri build    # build the installer for your platform
```

`npm run build` and `cargo test` run the checks CI runs.

## Under the hood

| Part                  | Does                                                             |
| --------------------- | ---------------------------------------------------------------- |
| `crates/gitspy-core`  | Lays out the graph (lanes, colours, lines); knows nothing of git |
| `crates/gitspy-repo`  | Reads commits and objects through gix                            |
| `crates/gitspy-exec`  | Runs system git for repository state and every write             |
| `crates/gitspy-hosts` | GitHub, GitLab and Bitbucket APIs                                |
| `crates/gitspy-term`  | Terminal sessions                                                |
| `crates/gitspy-ai`    | Commit messages from a local model                               |
| `src-tauri`           | The Tauri app: commands, open repositories, file watching        |
| `src`                 | The interface: React, canvas, Monaco                             |

Reads go through [gix](https://github.com/GitoxideLabs/gitoxide); anything
that changes the repository or answers a question about its state goes through
your own installed git, so what gitspy shows is what `git status` says.

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). The
detailed rules the code follows are in [CLAUDE.md](CLAUDE.md).

## Licence

[GNU Affero General Public License v3.0](LICENSE).
