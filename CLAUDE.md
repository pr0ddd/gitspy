# gitspy

A desktop git client: branch and tag labels on the commits, avatars, a
minimap, resizable columns, and our own ideas on top. Tauri 2, the interface
in React and canvas, the repository read in Rust through gix, every state
question and every write through system git.

## Commands

```bash
npm run app                 # the whole app (Tauri + Vite)
npm run build               # translations, boundary types, notices, Prettier, ESLint, tsc, vitest, bundle
npm test                    # vitest only
npm run lint                # ESLint only
npm run i18n:check          # translation completeness only
npm run notices             # regenerate THIRD-PARTY.md from the lockfiles
npm run format              # Prettier over the tree
npm run licenses:check      # npm dependency licences
cargo test                  # every Rust test
cargo test -p gitspy-repo   # one crate
cargo clippy --all-targets -- -D warnings
cargo fmt --all
cargo deny check licenses   # cargo dependency licences (deny.toml)

cargo run -q --release -p gitspy-repo --example dump_repo -- <path> <count>
```

`dump_repo` is the measuring stick: it prints the number of commits, lanes and
outside parents and the time to read and lay out. Any claim about performance
or the shape of the graph is backed by its output on a real repository, not by
reasoning.

## Layers

| Layer                 | What it does                                                                   | What it does not know      |
| --------------------- | ------------------------------------------------------------------------------ | -------------------------- |
| `crates/gitspy-core`  | Graph layout: topology → lanes, colours, segments                              | What git, gix or a disk is |
| `crates/gitspy-repo`  | Objects through gix: walk order, parents, commit metadata                      | How any of it is drawn     |
| `crates/gitspy-exec`  | System git with a defused environment: repository state and every write        | Which operation it is      |
| `crates/gitspy-hosts` | GitHub, GitLab, Bitbucket behind one `Host` enum                               | The app around it          |
| `crates/gitspy-term`  | PTY sessions                                                                   | What runs inside them      |
| `crates/gitspy-ai`    | Commit messages from a local model                                             | The working tree           |
| `src-tauri`           | The boundary: Tauri commands, open repositories, watchers, the operation queue | Algorithms                 |
| `src`                 | Canvas rendering, scrolling, interaction                                       | How git works              |

`gitspy-core` depends neither on gix nor on Tauri — its tests run on synthetic
topologies without a single repository on disk.

## Code

**There are no comments in the code.** Not `//`, not `///`, not `//!`, not
`/* */`. The one carve-out is a file we do not write by hand: the ts-rs banner
in `src/shared/api/generated/`.

This is not a ban on explaining; it is a demand to explain more reliably. A
comment is checked by nothing and lies within six months. So the "why" lives
where something watches over it:

| What to explain                       | Where                                                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Why the code is the way it is         | The function's name. If it does not fit a name, the function does too much                                  |
| Which behaviour, and why exactly that | The test's name plus the message in its `assert`                                                            |
| Why this design and not another       | The commit message; a larger design is written up before the work and its decisions land in names and tests |
| What was broken and how it was fixed  | The commit message                                                                                          |

The rule closes on itself: the urge to write a comment means a function with a
telling name has to be extracted, or a test with a telling name written.

**Language.** Identifiers, prose, assert messages, test names and commit
messages are English. There are no user-visible strings in the code at all:
only i18n keys.

## Interface

The skeleton: repository tabs, an action bar, refs on the left, the graph on
canvas in the middle, details on the right.

**The frontend is laid out in Feature-Sliced layers**; imports go strictly
downwards, and between slices only through the slice's `index.ts` facade
(ESLint guards both):

| Layer                                                 | What lives there                                                                 | Examples                                                                                  |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| foundation — `shared/` (`api`, `ui`, `lib`, `config`) | ipc, types, icons, theme, prefs, i18n, toast, the `parts.tsx` vocabulary, shadcn | imports nothing from above                                                                |
| `entities/`                                           | domain slices without React scaffolding                                          | `graph` (scene, render, chips…), `repo` (session, confirm, pulls), `diff` (monaco, hunks) |
| `features/`                                           | behaviour on top of entities                                                     | `search`, `updater`, `menus`, `repo` (loading, operations, commit draft)                  |
| `widgets/`                                            | skeleton components, one file per part                                           | GraphView, Sidebar, Toolbar, Settings…                                                    |
| `app/`                                                | `App.tsx` — composition and session state only, `main.tsx`                       |                                                                                           |

### shadcn and tokens

**The interface is assembled from canonical shadcn components.** They live in
`src/shared/ui/` and are edited only to add a variant — never to bend one for
a single screen. A different-looking button is a new `cva` variant, not a
class on top.

**There are no style files of our own.** No `styles.css` with hand-written
classes, no `className` with private values like `p-[7px]` or
`text-[#7b8798]`. Looks are Tailwind utilities bound to the theme.

**Recurring parts of the skeleton live in `src/shared/ui/parts.tsx`, and only
there.** `ListRow` (a row of any list, h-6), `SectionHeader` (a section
heading, h-7), `PanelBar` (the head of a side panel, h-8), `ViewBar` (the head
of the main view, h-9), `InlineNote` and `PanelNote` (empty states),
`FilePath` (directory + name). A new list or heading starts from these parts;
assembling a row again from bare utilities means creating a second, slightly
different variant of the same thing, and that is exactly what the vocabulary
protects against. Muted text is `text-muted-foreground` without home-made
opacity; compact buttons are the `2xs`/`xs` sizes in `cva`, not a `className`
on top.

**Every value lives in `src/theme.css` and nowhere else** (`src/index.css`
only pulls in the fonts, Tailwind and that file). It is the single source: the shadcn variables (`--background`, `--primary`, `--border`,
`--ring` and the rest), our git colours with meaning (`--status-added`,
`--status-deleted`, `--status-ahead`…), the colours of ref kinds and the graph
palette. Changing one value must change the whole app at once — if recolouring
a button means touching a hundred places, the system is broken.

**The canvas separately.** The graph is drawn by hand, but takes its colours
from the same variables through `getComputedStyle`, not from a baked-in
array. Otherwise editing a token changes the interface and not the graph —
exactly the drift all of this exists to remove.

### Icons

The pack is `lucide-react`, shadcn's own. Components **do not import from it
directly** (only the shadcn primitives in `src/shared/ui/` do): `src/shared/ui/icons.ts` names icons by meaning — `Icon.branch`,
`Icon.stash`, `Icon.pull`. Changing the pack means editing one file, not forty
call sites.

An icon goes next to text, not instead of it, except where room has physically
run out (close a tab, add). Sizes: `size-3` in dense rows, `size-3.5` in
buttons and headings.

### Motion

`tw-animate-css` animates Radix states through `data-state`: dropdown menus,
dialogs, tooltips, collapsing sections. That is shadcn canon and needs no JS.

Movement under a gesture — dragging dividers, the minimap — is not animated
at all: the element follows the pointer through direct style updates inside a
`requestAnimationFrame`, without a React render per move.

**Only `transform` and `opacity` are animated.** Everything else — width,
height, `top`, `left` — makes the browser recompute layout and drops frames.
That, not the choice of library, decides whether the app feels smooth or
jerky.

The graph's smoothness comes not from a library but from a
`requestAnimationFrame` loop and the absence of React renders while scrolling.
A test guards it (see Tests).

Several repositories can be open. Session state lives in the frontend, and
Rust keeps one open repository per path — every command takes `repo`. A single
"the open repository" exists at no level: that is exactly the implicitness
that would later have to be threaded through every command at once.

**Toasts are one system for the whole app.** The library is `sonner`, the one
entry point is `src/shared/ui/toast.ts`, `<Toaster>` is mounted once in
`App`. Components do not call `sonner` and do not invent notifications of
their own. Errors go the same way: there is no separate red banner.

**Boundary types are generated from Rust.** Structures in
`src-tauri/src/views.rs` and `recent.rs` carry `#[derive(TS)]`;
`cargo test -p gitspy-app` writes them into `src/shared/api/generated/`. Those
files are never edited by hand; `src/shared/api/types.ts` only re-exports them
and adds numeric codes.

`npm run boundary:check` regenerates the types on every build and fails if the
result differs from what is committed. Rename a field in Rust and forget the
frontend — the build goes red instead of the window going black.

**Every `invoke` lives in `src/shared/api/ipc.ts`.** `boundary:check` guards
that too: an `invoke` from any other file fails the build. Components call
functions from there, not Tauri directly.

What does not exist is not drawn: an honest empty-state note, never invented
data.

### Write operations

**Ownership is split by facts, not by taste.** `gix` handles objects in bulk —
walking history and reading commit metadata; that is the only job where the
library beats the process (a 60-row window: 0.13 ms against 10). All
repository state — which refs exist, where they point, which is current, who
tracks whom, what is in the working tree — is asked of system `git`, because
on state it is the reference, and a quiet disagreement between us and the
terminal is invisible in tests: both answers look plausible.

The reason is not speed: `git for-each-ref` on react costs 18.8 ms against
13.2 for reading through gix, and on a small repository 27.1, because we pay for
starting a process, not for the refs. The reason is that one call returns
strictly more and removes 64 lines of hand-made repairs.

Every git process goes through `gitspy-exec`.

**Hosts go through one `Host` enum** in `gitspy-hosts`: every capability
(sign-in, account, repositories, pull requests, commit avatars, credential
helper) is implemented by every provider, and `if host == …` outside the Host
dispatch is forbidden. Sign-in is described by data (`ConnectStartView`): a
device code, a browser PKCE flow or a token form — the frontend renders them
with one component. Connections are a list in storage; a repository is matched
to a connection by `matches_remote` on the host of the remote URL. Client ids
are compiled in; the secrets sit in the relay worker (`workers/oauth-relay`).

**The environment is defused, and tests prove it.** `GIT_TERMINAL_PROMPT=0`,
editor and pager stubbed, `GIT_ASKPASS` and `SSH_ASKPASS` route credential
requests to us, `ssh` runs with `BatchMode=yes`. Without this, git waits for a
person at a terminal that does not exist on the first private repository, and
the operation hangs forever without a sign.

Inherited `GIT_DIR`, `GIT_WORK_TREE` and the rest are scrubbed: otherwise the
operation lands in the wrong repository.

**Operations are a closed list** (`Operation` in `src-tauri/src/operations.rs`),
not an arbitrary string from the frontend. One operation per repository at a
time: the queue holds a lane per path. Destructive operations go through the
confirm bar (`entities/repo/confirm.ts` says which ones); the only forced push
is `PushForceWithLease`, offered only after the remote rejected an ordinary
push.

**Invalidation is one for all.** The `.git` watcher emits `repo:changed`, and
the app re-reads the repository — whether it was our operation or a commit
from a terminal behind our back.

## i18n

One language so far: `en`. The machinery is complete — `i18next` with
`react-i18next`, catalogues in
`src/shared/config/locales/<language>/<namespace>.json`, namespaces `common`
and `errors`; a new language is a new catalogue plus an entry in `LOCALES`, not
a rewrite of components.

Keys are English, flat, dotted by meaning: `repo.open`, `graph.lanes`. The
i18next key separator is off, so the dot is part of the name, not nesting.
Plurals use i18next suffixes (`_one`, `_other`); numbers and dates go through
`Intl` (`{{count, number}}`), never by hand.

`npm run i18n:check` guards completeness on every build: it compares the key
sets of all languages with the reference and demands every plural form CLDR
requires for the language.

**Rust returns no human text.** An error at the boundary is a code and
parameters, not a ready phrase:

```rust
{ "code": "repo.open", "params": { "path": "/…" }, "detail": "…" }
```

`detail` is a technical string from gix or git; it is not translated and is
shown as the detail. Everything the user sees is assembled by the frontend
from the code.

The reason is hard: translate the backend and the app's language becomes a
property of the process instead of a setting. It could no longer be switched
without a restart.

## Tests

**The reading layer is checked against real git.** Not "we think it is right"
but "it matches the reference": `crates/gitspy-repo/tests/support` builds
fixtures with real git, fixed dates and the user's config disabled, and the
test compares our output with `git log --date-order`, `git for-each-ref` and
the rest. Whatever git can be asked, git is asked.

**The frontend is tested on its pure part.** All geometry — the visible range,
lane positions, nodes pinned to the edge, shadows, hit testing, the scroll
anchor — lives in `src/entities/graph/scene.ts` without a single canvas call
and is covered by tests. `src/entities/graph/render.ts` only lays paint where
the numbers say.

A separate test holds the smoothness: **not one React render may happen while
scrolling**. It measures commits through `Profiler` and flushes them through
`act` — without that it would pass on broken code too, verified by mutation.

**Layout is checked by properties and golden dumps.** `proptest` runs
invariants on random topologies; golden tests keep a textual dump of the
layout. Textual, not a picture made of characters: a diff over it reads.

The rule for defects: first a test that fails for the same reason as the real
error, only then the fix. A test that is green before the fix guards nothing.

Known difference from git: when committer times are exactly equal, the order
inside the group is ours. Topology is untouched and `--date-order` semantics
hold — in git that order is set by its internal heap.

## Commits

**The message is entirely English** — subject and body. The subject is
imperative or a statement of what is now true. The body says what was broken,
why, and what confirms the fix, with numbers:

```
Kahn re-sort: same order as git log --date-order

react: outside parents 191 → 0, lanes 218 → 99, layout 22.4 → 7.7 ms
```

Numbers are mandatory when performance or the shape of the graph changed.

**No trailers in commits.** No `Co-Authored-By`, no `Generated with`, nothing
else: authorship is set by `git config user.name`, and a second source of that
truth is not needed.

## Where things are written down

- `README.md` — what gitspy is, downloads, building from source
- `CONTRIBUTING.md` — the short version of this file for a first pull request
- `SECURITY.md` — reporting, what the app touches
- `CHANGELOG.md` — every version, in words for the person using it; the
  section is also the release text and the in-app "What's new"
- `.github/RELEASE_CHECKLIST.md` — the manual pass on three systems before a
  draft release is published
- `workers/oauth-relay/README.md` — the relay's contract and secrets
