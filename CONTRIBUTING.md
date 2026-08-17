# Contributing

Thank you for looking under the hood. This file is the short version; the
full contract the code follows is [CLAUDE.md](CLAUDE.md) — read it once, it
explains every rule below and why it exists.

## Before you start

- Open an issue first for anything beyond a small fix, so the shape is agreed
  before the work. Bug reports are best with the output of the same git
  operation from a terminal in the same repository.
- Security problems go through
  [private reporting](https://github.com/pr0ddd/gitspy/security/advisories/new),
  not issues — see [SECURITY.md](SECURITY.md).

## Setting up

Rust 1.85+, Node 22+, and on Linux the Tauri packages listed in the
[README](README.md#build-from-source). Then:

```bash
npm ci
npm run app
```

`npm run build` runs every frontend gate (translations, boundary types,
Prettier, ESLint, tsc, vitest, bundle); `cargo test`, `cargo clippy
--all-targets -- -D warnings` and `cargo fmt --all -- --check` cover Rust.
CI runs the Rust gates on Linux, macOS and Windows, the frontend gates on Linux
and Windows, and the licence gates on Linux — for every pull request.

## The rules that will come up in review

- **Tests first.** A defect gets a test that fails for the same reason before
  it gets a fix. A test that is green before the fix guards nothing.
- **No comments in code.** Not `//`, not `///`, not `/* */`. The "why" lives
  in the name of the function or the test and in the message of the assert;
  if it does not fit a name, the function does too much.
- **English identifiers and commit messages.** Commit subjects say what is
  now true; bodies say what was broken and how the fix was confirmed, with
  numbers when performance or the graph shape changed. No trailers.
- **One source of truth for looks.** Every colour and size is a token in
  `src/index.css` / `src/theme.css`; components are the shadcn set in
  `src/shared/ui`, extended with a `cva` variant, never a class on top; the
  canvas reads the same tokens.
- **User-visible text goes through i18n keys**, and Rust never returns
  prose — errors are a code plus parameters, translated by the frontend.
- **Frontend layers are Feature-Sliced**: `shared` < `entities` < `features`
  < `widgets` < `app`, imports strictly downwards, slices only through their
  `index.ts` — ESLint enforces it.
- **The boundary is generated.** Types crossing Rust ↔ TypeScript are derived
  from Rust (`cargo test -p gitspy-app` writes `src/shared/api/generated`); every
  `invoke` lives in `src/shared/api/ipc.ts`.
- **Reads go through gix, state and writes through system git**, with an
  environment that can never prompt (`GIT_TERMINAL_PROMPT=0`, askpass routed to
  the app, `BatchMode=yes` for ssh).

## Pull requests

Keep them focused; one concern per PR. Fill in the template — what changed and
why, how it was verified. CI must be green; a maintainer reviews from there.

By contributing you agree that your contribution is licensed under the
[AGPL-3.0](LICENSE) like the rest of the project.
