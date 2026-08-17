# Release checklist

A tag `vX.Y.Z` on `master` builds a **draft** GitHub release with four builds and
`latest.json`. Nothing reaches users until the draft is published. Before
publishing, run the checks below on the artifacts of that draft — on macOS,
Linux and Windows.

## Secrets the release workflow needs

Set once in the repository settings (Settings → Secrets and variables → Actions).
A fork without them builds unsigned artifacts on Linux and Windows and fails on
macOS, where signing and notarisation are mandatory for the updater.

| Secret                                        | Where it comes from                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `TAURI_SIGNING_PRIVATE_KEY`                   | `npm run tauri signer generate` — the private key; its public half is in `tauri.conf.json` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`          | the password given when that key was generated                                             |
| `APPLE_CERTIFICATE`                           | Developer ID Application certificate, `.p12` exported from Keychain, base64                |
| `APPLE_CERTIFICATE_PASSWORD`                  | the password of that `.p12`                                                                |
| `APPLE_SIGNING_IDENTITY`                      | the certificate's name, `Developer ID Application: <name> (<team id>)`                     |
| `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` | Apple ID, an app-specific password, and the team id, for notarisation                      |

`GITHUB_TOKEN` is provided by Actions itself.

## Before the tag

- [ ] `CHANGELOG.md` has a section `## X.Y.Z — YYYY-MM-DD` and it reads well as
      release notes (it becomes the release text and the in-app "What's new").
- [ ] `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`
      carry the same version (CI refuses the tag otherwise).
- [ ] CI is green on `master`.

## On each OS, from the draft's artifacts

- [ ] The app installs and starts (macOS: notarised, no Gatekeeper warning;
      Windows: SmartScreen warns — expected until the build is signed; Linux:
      AppImage runs, deb installs).
- [ ] Open a repository from disk; the graph draws, scrolling stays smooth.
- [ ] Open a diff in inline, split and hunk view; switch files without the
      line-number column jumping.
- [ ] Stage and unstage a file, stage a hunk, write a commit.
- [ ] Sign in to a host, see pull requests, push a commit through the account.
- [ ] Open the terminal dock; a shell comes up and reacts to input.
- [ ] Windows only: the terminal opens PowerShell (or cmd) — if it does not,
      the terminal button is disabled with a note, not broken.
- [ ] Start the previous version, let it find the update from `latest.json`,
      restart into the new one.

## Publish

- [ ] The draft carries all four builds and `latest.json`. A missing or failed
      leg means fixing on `master` and cutting a new tag — never publishing a
      partial draft.
- [ ] Publish the draft. `releases/latest/download/latest.json` now points at
      it, and every installed copy will pick it up on its next check.
- [ ] Delete the local demo repositories and test accounts you used.
