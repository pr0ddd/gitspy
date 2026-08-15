# Changelog

What changed in every released version of gitspy, written for the person using it.
Each heading is `## <version> — <YYYY-MM-DD>`; the section under it is also the text
of the GitHub release. Lines land in `## Unreleased` and get their version and date
when the tag is cut.

## Unreleased

### New

- A terminal lives in the app: PTY sessions in a dock over the graph, so a command
  no longer means leaving the window.
- The dock has a fullscreen layout — session on the left, the graph or the changes
  on the right — and moves between layouts instead of snapping into place.

### Improved

- Reviewing changes is one scroll: every file in the list expands in place instead
  of opening a separate view, and the header of an expanded file sticks to the top
  so its neighbours stay reachable.
- The rows that offered to reveal unmodified lines are gone. The patch already
  carries three lines of context, so opening a gap removed the row and showed
  nothing — the affordance did not work.
- The fullscreen split resizes by the same grip the side panels have, and remembers
  its width.
- Dragging a panel edge stays smooth. The grip no longer re-renders the whole app on
  every pointer move, the graph remeasures once per frame instead of many times, and
  the minimap is rebuilt only when the height actually changes.

## 1.0.5 — 2026-08-07

### New

- Write commit messages with a local model. Point gitspy at Ollama or LM Studio in
  Settings, pick a model, and the sparkle button in the working tree turns what you
  staged into a summary and a description. The diff is trimmed to fit the model's
  context, and the answer comes back as structured JSON rather than free text, so a
  chatty model cannot derail the form.
- The start page is built around favorites: star the repositories you come back to,
  and each row carries the branch and the host it belongs to without opening it.
  Starred repositories are shielded from the eviction that trims the recent list.
- Clone and create on the host you are signed into. The dialog lists your
  repositories with a search field, clones shallow if you ask, or creates a new
  repository on the provider, seeds it from a template and pushes the first commit.
- GitLab and Bitbucket became first-class next to GitHub: sign in through the
  browser, see your account, repositories and pull requests. Every provider now
  fills the same set of capabilities, so nothing is GitHub-only anymore.
- Settings became a page of its own with five sections — general, interface, editor,
  AI and integrations. Auto-fetch interval, remembering open tabs, the default pull
  mode and the initial branch name; editor font, size, tab width, syntax, line
  numbers and wrapping; interface zoom, compact graph, minimap and graph columns.
- Interface zoom from 80 to 300 percent, from the bottom bar or with Cmd/Ctrl plus,
  minus and zero.
- Both side panels resize by dragging their edge and remember the width.

### Improved

- Every author has a face: the photo when the host has one, a generated mark when it
  does not. The mark follows the commit rather than a guess about the name.
- Commits carry the committer next to the author, so a rebased or cherry-picked
  commit stops pretending it was made by the person who wrote it.
- The details pane reads as its own surface — meta as pills with icons, quieter
  titles, square status badges.
- The graph scrollbar keeps a reserved gutter instead of covering the columns under
  it, and the minimap can be turned off.
- Themes are five captured token sets behind one switch, and light themes drop the
  sheet shadow entirely: the border is the edge.
- Closing the window hides it; the dock icon brings it back with the tabs intact.
- The update check runs hourly instead of every four hours.
- The app wears the gitspy commit-graph icon, in the shape macOS expects.

### Fixed

- Commit metadata no longer cuts a string in the middle of a character, which used
  to be a crash on any commit with non-ASCII text in the wrong place.
- A stale loopback listener from an earlier sign-in is evicted, so signing in twice
  in one session works.
- Avatar lookups tell a missing avatar from a failed request and stop retrying the
  ones that are simply absent.
- Development builds stopped forcing the devtools open on start.

## 1.0.4 — 2026-08-05

- gitspy runs the same git your terminal runs. It asks your login shell for git
  before falling back to `PATH`: an app launched from Finder inherits the bare system
  `PATH` and used to pick `/usr/bin/git` while your terminal ran the one from
  Homebrew. On one machine that meant a repository with stashes refused to open,
  although every command worked in the terminal.
- A diff that fails to load says what went wrong in git's own words. Only a genuinely
  absent path reads as an empty side; everything else is now an error instead of a
  blank pane.

## 1.0.3 — 2026-08-05

- Repositories with huge working trees open instantly again. Watching `.git` used to
  walk the entire tree and stat every file before it started: a checkout of 751 000
  files stalled for 15 to 21 seconds, while a repository with 30 000 commits and few
  files opened at once — the cost was the disk, not the history. Subscribing now
  takes under a millisecond, and a test fails if it ever stops being constant.

## 1.0.2 — 2026-08-05

- Tag chips carry a tag glyph after the name, so tags read apart from branches at a
  glance instead of by their first letter.

## 1.0.1 — 2026-08-05

- Release plumbing only: re-running a release updates the existing download instead
  of failing on it. Nothing changed in the app.

## 1.0.0 — 2026-08-05

The first release, rebuilt from scratch on Tauri and Rust after the Electron
prototype was thrown away.

### The graph

- History drawn on canvas: lanes coloured by column, nodes pinned to the edge when
  the graph is scrolled sideways, branch and tag chips with leader lines to their
  commit, avatars in the nodes, and a minimap.
- A commit table beside it — author, date, sha, branch and tag — with columns you can
  resize, hide and reorder; the layout is remembered.
- Scrolling repaints the canvas on its own animation frame and does not re-render the
  interface, which is what keeps a million-commit history smooth.

### Repositories

- Several repositories open at once as tabs, a start page with the recent list, open
  from disk or clone by URL.
- The app watches `.git` and re-reads itself, so a commit made in your terminal shows
  up without being asked.

### Branches, tags, stashes

- The left panel is a tree of local and remote branches, tags, stashes and worktrees,
  with upstream and the ahead/behind counts read from git itself rather than guessed.
- Checkout, create, fetch, pull, push, merge and the rest run one at a time per
  repository, and a bar asks first for the ones that cannot be taken back.
- Background fetch once a minute, cancellable.

### Working tree, diff, conflicts

- Working tree status with staging, unstaging and a commit box.
- Diff on Monaco in inline, split and hunk modes, with a minimap of the changes.
- File history for any path, anchored to the commit you came from.
- A conflict view with both sides side by side and synchronised scrolling.

### GitHub

- Sign in, see the pull requests of the repository, and let commit authors wear their
  real avatars.

### The app itself

- A custom window with the quiet skin, several themes, and every colour coming from
  one set of tokens shared by the interface and the graph.
- Automatic updates: a new version is downloaded in the background, and the bottom
  bar quietly offers a restart when it is ready.
