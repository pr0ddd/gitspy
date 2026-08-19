# Changelog

What changed in every released version of gitspy, written for the person using it.
Each heading is `## <version> — <YYYY-MM-DD>`; the section under it is shown in the
app under "What's new" and is the text of the GitHub release.

## 1.2.1 — 2026-08-19

Updates that wait for you, and a banner while gitspy starts.

### New

- gitspy now opens with a small banner — the mark turning over your history —
  and the window appears once it has drawn, so you never see it blank.
- Updates no longer install themselves. When a newer version is out, a quiet
  "Update to X" appears in the bottom bar and nothing happens until you click
  it. The click hides the window, the banner shows "Updating to X" with the
  download, and gitspy comes back updated. If you never click, the next launch
  installs it behind the same banner.
- Windows updates now run silently: no installer window, gitspy simply comes
  back in the new version. On Linux, the AppImage updates in place; the .deb
  and .rpm packages point you to the release page instead of asking for a
  password.

### Improvements

- Starting gitspy never waits for the network: it checks for updates in the
  background, ten seconds after opening and then once an hour.

### Bug Fixes

- Fixed an issue where gitspy on Windows closed itself, showed the installer
  and reopened as soon as an update was found.
- Fixed an issue where closing the window on Windows and Linux left gitspy
  running with no way to bring it back. Closing the window now quits, as it
  should; on macOS it still stays in the Dock.

## 1.2.0 — 2026-08-18

One branch chip per commit that never gets cut, and toasts that say what happened.

### New

- Toasts now tell their kind by colour: green for a success, blue for a fact,
  red for a failure, with the glyph cut out of the coloured block.
- Toasts now say what happened in full: "Pushed Successfully" with "develop to
  origin", "Merged" with "feature into develop", "Checkout Successful" with the
  branch, "Deleted: old-branch".
- A pull, merge or fast-forward that brings nothing now says "Already
  Up-to-Date" and names the branch that did not move.
- Deleting a file from the working tree, checking out from the sidebar or from
  a pull request, cloning, creating a repository and connecting a host now show
  a toast.
- You can now double-click any branch in the unfolded panel of a commit to check
  it out, and right-click it for its menu.

### Improvements

- The branch column now shows one chip per commit — the most prominent branch
  or tag — with a `+N` counter for the rest; hover any chip or the counter to
  unfold them all.
- Chips now take the colour of their lane; the checked-out branch is a shade
  stronger.
- Narrowing the branch column no longer clips chips: the name shortens, then the
  marks give way one by one, and the counter goes last; the check mark of the
  current branch always stays.
- The selected row now reads by colour instead of a ring around the node, and
  the highlight wraps the avatar from its left edge.
- Muted text is a step brighter, so the action bar, the search field and the
  captions read more easily.
- The action bar no longer blinks around a pull or a push: the push button
  keeps its colour, the bar does not fade, and the moving arrow starts and stops
  at rest.
- Toasts now sit at the bottom left, stay open as a stack, and last three, five
  or ten seconds depending on how much there is to read.
- The bottom bar's buttons are now quiet until hovered.
- Themes are now named for what they look like: Dark, Graphite, Midnight, Light
  and Paper. A theme chosen under an old name falls back to the default once —
  pick it again in Settings.

### Bug Fixes

- Fixed an issue where a file created or deleted in the working tree took a
  while to appear on the graph as the working-tree row, or to leave it.
- Fixed an issue where a binary file in a diff failed with "git failed" and left
  the editor blank for the next file. Binary files now show a note in the diff,
  in the working tree and in the file history.
- Fixed an issue where an untracked binary file looked like an empty file in
  the changes panel.
- Fixed an issue where a file that stopped being binary kept showing the binary
  note.
- Fixed an issue where a remote branch with the same name on the same commit
  was shown as a separate chip even without an upstream.
- Fixed an issue where double-clicking the unfolded name of a truncated branch
  chip, or a hidden chip in the panel, did not check the branch out.
- Fixed an issue where hovering the unfolded panel highlighted the row
  underneath instead of the panel's own row.
- Fixed an issue where the checkout toast named the branch you clicked instead
  of the one you landed on: `pr/N` for a pull request from a fork, the local
  branch for a remote one.
- Fixed an issue where a fast-forward with nothing to move said
  "Fast-forwarded".

## 1.1.2 — 2026-08-17

The graph column, the crumbs and the columns learn to be narrow.

### Improved

- The graph column folds into a single column. Squeeze it and the nodes of
  every lane converge on one axis while the lines and the edge shades fade
  out; at the minimum width you get one clean line of dots with the colour
  bar next to each message, no dark band, no staggered nodes. Widen it back
  and everything unfolds the same way. The left shade now grows in over the
  first lane of horizontal scroll instead of snapping on.
- Every column can be narrowed to an icon: when the heading no longer fits,
  it becomes a glyph — branch, graph, message, person, clock, hash — centred
  on the column, and the columns' floors came down to match.
- The repository crumb keeps its name however long the branch name is; the
  branch crumb is the one that truncates, and it never shrinks below its
  caption, so the hover fill covers what you see. A truncated crumb shows the
  full name in the app's own tooltip — only while it is truncated.
- Picking a branch in the crumb menu shows its commit on the graph, as a
  click in the sidebar does, and then switches to it.
- The list of results under the search field closes when you click anywhere
  else, and on Tab.

### Fixed

- Hiding the Date column left every date printed on top of the SHA column.
  A hidden column paints nothing now, and author, date and hash are each cut
  to their column's width.
- During a checkout the branch menu could mark two branches as current for
  a moment — HEAD from the refs and the branch of the working tree are
  refreshed at different times. One source decides now, the same one that
  names the branch in the crumb.

## 1.1.1 — 2026-08-17

Windows and Linux polish, one day after their first builds.

### Improved

- Windows and Linux wear the same window as macOS: no system title bar — the
  tabs sit in the top row, with minimize, maximize and close drawn by the app
  on the right. Dragging an empty part of the tab row moves the window, a
  double click on it maximizes, exactly as the system bar did.

### Fixed

- On Windows, every question the app asked git opened a console window for a
  blink and stole focus — a single file diff runs three git processes, so the
  screen flickered with black boxes and every click felt slow. The same
  happened on opening a file or the terminal from the app. git now runs
  without a console at all: the windows are gone, and with them the most
  expensive part of every call.

## 1.1.0 — 2026-08-17

### Open source

- gitspy is open source under the AGPL-3.0: the code is at
  https://github.com/pr0ddd/gitspy, releases are built there for macOS (Apple
  Silicon and Intel), Linux (AppImage, deb, rpm) and Windows (installer and msi),
  and the app updates itself from GitHub Releases. This is the first version with
  Linux and Windows builds; the Windows build is not signed yet, so SmartScreen
  warns once. A copy of 1.0.x will not find this update on its own — the old
  update address is gone; download 1.1.0 once from Releases and it updates itself
  from there on.
- On Windows the terminal opens PowerShell (or cmd when there is none) through
  ConPTY; the terminal on every system starts your own login shell.

### New

- Merge conflicts are resolved in a real editor. Both sides and the result are
  three Monaco editors with syntax highlighting that scroll together; a checkbox
  beside each conflict block takes the whole block from that side, marks in the
  gutter take or drop single lines, and the result can be edited by hand before
  Save. Blocks nobody has picked yet show the common ancestor, so the result is
  never a hole. The panes resize.
- Every destructive action asks first, in one place: the confirm bar at the top
  of the graph. Deleting a branch, dropping a stash, discarding changes, hard
  reset — the same bar. Force push is never a button: it is offered in that bar
  only after the remote rejected an ordinary push, next to Pull, and it runs with
  `--force-with-lease`.
- A branch whose upstream is gone carries a red marker in the sidebar; a click on
  it deletes the branch through the confirm bar. Deleting goes with `-D`, so
  squash-merged branches, which git's `-d` refuses, go too.
- Hovering the avatar of a commit names the author, and the co-authors from the
  message, with their emails.
- The tab strip's "+" opens a "New tab" entry when a start page is already open
  elsewhere.

### Improved

- The working tree is one panel in every mode. During a merge the same panel
  shows Conflicted, Unstaged (only when there is something) and Resolved files,
  with the same chips, the same Path/Tree switch, and Amend and Push after commit
  in their usual place. The conflict banner in the details is the same banner as
  a pending commit, the row of the working tree in the graph is an orange band.
- The pull requests tab is there only when the repository lives on a host you can
  sign in to; without an account it says so instead of loading forever.
- GitLab tokens are refreshed on their own, a minute before they expire, so the
  connection no longer drops after two hours. A host that rejects its saved
  sign-in says so in Settings and offers to sign in again, rather than failing
  quietly.
- The toolbar adapts to the window width instead of overlapping, the window has
  a minimum size of 960×600, the minimap is off by default, and Settings sit on
  the left with the width they need.
- The repository dialog has one fixed height, its footer appears only once a host
  is connected, and Escape closes every dialog. Integrations in Settings and in
  the dialog read the same connections — no more "None" flashing before the
  account.

### Fixed

- The details of a repository dialog no longer crash on a tab that was closed
  while the mode switched, and closing the dialog no longer flashes.
- Windows: the file watcher follows the resolved repository root and reads paths
  with either separator; text files check out with LF so the tests and the app
  see the same bytes.

## 1.0.6 — 2026-08-15

### New

- A terminal lives in the app: PTY sessions in a dock over the graph, with tabs
  for several sessions per repository, so a command no longer means leaving the
  window.
- The toolbar starts with two breadcrumbs: the repository and the branch. The
  repository menu lists favorites and the last four opened, searches across
  everything you have ever opened, and ends in "View all repositories". The branch
  menu lists local branches — the ones checked out in a worktree first, then the
  rest alphabetically — and switching to a worktree branch opens that worktree.
- Search shows what it found. Type into "Search commits" and a list of the first
  twenty matches drops down under the field — subject, author, date, short hash;
  a click jumps the graph to it. The counter and the arrows moved inside the field,
  so it no longer shrinks while you type.
- Drop a folder anywhere in the window and gitspy opens the repository it belongs
  to — a subfolder or a file inside one resolves to the root; a folder outside git
  says so instead of failing quietly.
- The start page has an empty state: an isometric commit graph, three ways in
  (open a folder, clone, create), and a hint about dropping a folder.
- The tree view of the working tree folds. Folders start closed with a tally of
  what is inside by status letter, "Expand all / Collapse all" sits in the toolbar,
  and selecting a file opens the folders above it.

### Improved

- Switching files in the diff no longer makes the line-number column jump. The new
  file is compared before it is shown — the previous one stays on screen for the
  11–45 ms the diff takes — and the hunk bars are installed in the same pass in
  which Monaco aligns the two sides, so the first painted frame is already right.
  Measured on real files: zero offset in every one of the first thirty frames, where
  it used to be off by 26 to 92 pixels for two or three frames.
- Keyboard shortcuts work on any layout. Letters are matched by the physical key,
  so `S` stages under a Cyrillic layout too; and shortcuts are routed before the
  diff editor sees them, so a read-only diff under focus no longer swallows arrows,
  `S` and `U`.
- After staging or unstaging a file, the selection is placed from git's own answer
  rather than predicted: it moves to the next file of the same section, follows the
  file across if it was the last one, and — with the diff open — shows the next
  file at once. Nothing is highlighted twice, nothing flickers under the cursor.
- The working tree panel was reshaped: section headers read "Unstaged files" and
  "Staged files" with a chevron to collapse each, the actions are outlined in green
  and red and read "Stage all changes" / "Unstage all changes", a row shows its own
  "Stage file" / "Unstage file" on hover, and Path/Tree is a segmented switch. The
  same switches serve the diff toolbar; toggles keep their pressed look under a
  tooltip.
- The branch chip in the working-tree header is filled instead of outlined, the
  hunk bar in the diff is a ruled band that runs under the line numbers, and the
  overview ruler is off in hunk view where it had nothing to say.
- Reviewing changes is one scroll: every file in the list expands in place instead
  of opening a separate view, and the header of an expanded file sticks to the top
  so its neighbours stay reachable. The rows that offered to reveal unmodified lines
  are gone — the patch already carries three lines of context, so opening a gap
  removed the row and showed nothing.
- The sidebar collapses while a diff is open and comes back when you leave it;
  the collapse button in the diff takes you back to the graph.
- Dragging a panel edge stays smooth. The grip no longer re-renders the whole app on
  every pointer move, the graph remeasures once per frame instead of many times, and
  the minimap is rebuilt only when the height actually changes.
- Pointer cursors are a theme rule now: every button, tab, option and switch shows
  a hand, disabled ones do not — instead of a class here and a missing one there.

### Fixed

- Staging several files quickly no longer trips over `index.lock`. Two causes:
  `git status` briefly takes the lock while it refreshes the index, and a click on
  a file that git had already moved ran `git add` on a path that no longer matched.
  Reads now run with `GIT_OPTIONAL_LOCKS=0`, and path operations go through a queue
  that checks the fresh tree before calling git. The "did not match any files"
  error some of you saw was the second half of the same story.

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

The first release: gitspy on Tauri and Rust.

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
