use gitspy_core::chunk::Skeleton;
use gitspy_core::layout::{Layout, NodeKind, Segment};
use gitspy_exec::refs::{RefKind, RefLine};
use gitspy_repo::{History, Node};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
use ts_rs::TS;

pub const MINIMAP_BUCKETS: usize = 2048;

mod node_kind {
    pub const NORMAL: u8 = 0;
    pub const MERGE: u8 = 1;
    pub const ROOT: u8 = 2;
    pub const OPEN: u8 = 3;
}

mod segment_kind {
    pub const THROUGH: u8 = 0;
    pub const BRANCH: u8 = 1;
    pub const MERGE: u8 = 2;
}

#[derive(Serialize, Clone, TS)]
#[ts(export, export_to = "../../src/generated/")]
pub struct ErrorView {
    pub code: String,
    pub params: BTreeMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl ErrorView {
    pub fn new(code: &str) -> Self {
        Self {
            code: code.to_string(),
            params: BTreeMap::new(),
            detail: None,
        }
    }

    pub fn param(mut self, key: &str, value: impl ToString) -> Self {
        self.params.insert(key.to_string(), value.to_string());
        self
    }

    pub fn detail(mut self, detail: impl ToString) -> Self {
        self.detail = Some(detail.to_string());
        self
    }
}

impl From<gitspy_repo::Error> for ErrorView {
    fn from(error: gitspy_repo::Error) -> Self {
        use gitspy_repo::Error::*;

        let view = ErrorView::new(error.code());
        let view = match &error {
            OpenRepo { path, .. } => view.param("path", path),
            ParentBeforeChild { parent, child } => {
                view.param("parent", parent).param("child", child)
            }
            WalkHistory { .. } | ReadObject { .. } => view,
        };

        Self {
            detail: error.detail().map(str::to_string),
            ..view
        }
    }
}

pub fn state_lock_failed() -> ErrorView {
    ErrorView::new("app.stateLock")
}

#[derive(Serialize, Clone, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct RepoView {
    pub path: String,
    pub count: usize,
    pub max_lane: u16,
    pub head: Option<u32>,
    pub truncated: bool,
    pub read_ms: f64,
    pub layout_ms: f64,
    pub minimap: Vec<u32>,
    pub minimap_colours: Vec<u8>,
    pub remotes: Vec<RemoteView>,
    pub refs: Vec<RefView>,
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub enum RefKindView {
    LocalBranch,
    RemoteBranch,
    Tag,
    Stash,
}

#[derive(Serialize, Clone, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct RemoteView {
    pub name: String,
    pub avatar_url: Option<String>,
    pub web_url: Option<String>,
}

pub fn build_remote_views(urls: Vec<(String, String)>) -> Vec<RemoteView> {
    urls.into_iter()
        .map(|(name, url)| {
            let github = gitspy_hosts::remote::github_repo(&url);
            RemoteView {
                name,
                avatar_url: github
                    .as_ref()
                    .map(|(owner, _)| format!("https://github.com/{owner}.png?size=64")),
                web_url: github
                    .as_ref()
                    .map(|(owner, repo)| format!("https://github.com/{owner}/{repo}")),
            }
        })
        .collect()
}

#[derive(Serialize, Clone, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct RefView {
    pub name: String,
    pub kind: RefKindView,
    pub commit: u32,
    pub oid: String,
    pub is_head: bool,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub gone: bool,
}

#[cfg(test)]
mod ref_view_tests {
    use super::*;

    fn line(name: &str, ahead: u32, behind: u32, gone: bool) -> RefLine {
        RefLine {
            name: name.to_string(),
            full_name: format!("refs/heads/{name}"),
            kind: RefKind::LocalBranch,
            oid: "aaa".to_string(),
            is_head: false,
            upstream: Some("origin/main".to_string()),
            ahead,
            behind,
            gone,
        }
    }

    #[test]
    fn a_ref_whose_commit_is_outside_the_walk_is_not_shown() {
        let rows = HashMap::new();
        assert!(
            build_ref_views(&[line("main", 0, 0, false)], &rows).is_empty(),
            "ссылка без строки нарисовалась бы указывающей в никуда"
        );
    }

    #[test]
    fn counts_travel_to_the_boundary_unchanged() {
        let rows = HashMap::from([("aaa".to_string(), 7u32)]);
        let built = build_ref_views(&[line("main", 3, 1, false)], &rows);

        assert_eq!((built[0].ahead, built[0].behind), (3, 1));
        assert_eq!(built[0].commit, 7);
        assert!(!built[0].gone);
        assert_eq!(built[0].upstream.as_deref(), Some("origin/main"));
    }

    #[test]
    fn two_refs_on_one_commit_both_reach_the_boundary() {
        let rows = HashMap::from([("aaa".to_string(), 7u32)]);
        let built = build_ref_views(
            &[line("main", 0, 0, false), line("dup", 0, 0, false)],
            &rows,
        );

        assert_eq!(
            built.len(),
            2,
            "строки схлопываются по oid, ссылки схлопываться не должны"
        );
    }
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct WorktreeView {
    pub name: String,
    pub path: String,
    pub branch: Option<String>,
    pub is_main: bool,
    pub is_locked: bool,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum RowView {
    #[serde(rename_all = "camelCase")]
    Commit {
        index: u32,
        lane: u16,
        colour: u8,
        node: u8,
        hash: String,
        author: String,
        email: String,
        #[ts(type = "number")]
        time: i64,
        subject: String,
        body: String,
    },
    #[serde(rename_all = "camelCase")]
    WorkingTree {
        index: u32,
        lane: u16,
        colour: u8,
        node: u8,
        added: u32,
        modified: u32,
        deleted: u32,
        conflicts: u32,
        in_progress: Option<String>,
    },
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct ChangedFileView {
    pub status: String,
    pub path: String,
    pub old_path: Option<String>,
    pub similarity: Option<u8>,
    pub added: Option<u32>,
    pub deleted: Option<u32>,
    pub binary: bool,
}

pub fn build_changed_files(files: Vec<gitspy_exec::changes::ChangedFile>) -> Vec<ChangedFileView> {
    files
        .into_iter()
        .map(|f| ChangedFileView {
            status: f.status.letter().to_string(),
            binary: f.is_binary(),
            path: f.path,
            old_path: f.old_path,
            similarity: f.similarity,
            added: f.added,
            deleted: f.deleted,
        })
        .collect()
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct StatusEntryView {
    pub staged: bool,
    pub letter: String,
    pub path: String,
    pub old_path: Option<String>,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct FileCommitView {
    pub hash: String,
    pub author: String,
    pub email: String,
    #[ts(type = "number")]
    pub time: i64,
    pub subject: String,
    pub status: String,
    pub path: String,
    pub old_path: Option<String>,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct BlameSpanView {
    pub hash: String,
    pub author: String,
    #[ts(type = "number")]
    pub time: i64,
    pub summary: String,
    pub start_line: u32,
    pub lines: u32,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct MergingView {
    pub from: Option<String>,
    pub subject: String,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct WorkingTreeView {
    pub branch: Option<String>,
    pub upstream: Option<String>,
    pub remotes: Vec<String>,
    pub ahead: u32,
    pub behind: u32,
    pub staged: usize,
    pub unstaged: usize,
    pub conflicts: u32,
    pub in_progress: Option<String>,
    pub merging: Option<MergingView>,
    pub entries: Vec<StatusEntryView>,
}

pub fn build_working_tree(
    tree: gitspy_exec::status::WorkingTree,
    remotes: Vec<String>,
    heading: Option<gitspy_exec::MergeHeading>,
) -> WorkingTreeView {
    WorkingTreeView {
        branch: tree.branch.clone(),
        upstream: tree.upstream.clone(),
        remotes,
        ahead: tree.ahead,
        behind: tree.behind,
        staged: tree.staged(),
        unstaged: tree.unstaged(),
        conflicts: tree.change_counts().conflicts,
        in_progress: tree.in_progress.map(|p| p.code().to_string()),
        merging: heading.map(|h| MergingView {
            from: h.from,
            subject: h.subject,
        }),
        entries: tree
            .entries
            .into_iter()
            .map(|e| StatusEntryView {
                staged: e.side == gitspy_exec::status::Side::Staged,
                letter: e.letter.to_string(),
                path: e.path,
                old_path: e.old_path,
            })
            .collect(),
    }
}

#[derive(Serialize, Clone, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct PullView {
    pub number: u32,
    pub title: String,
    pub draft: bool,
    pub author: String,
    pub author_avatar_url: String,
    pub head_branch: String,
    pub base_branch: String,
    pub from_fork: bool,
    pub updated_at: String,
    pub mine: bool,
    pub assigned_to_me: bool,
    pub awaiting_my_review: bool,
}

#[derive(Serialize, Clone, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct PullListView {
    pub pulls: Vec<PullView>,
    pub truncated: bool,
    #[ts(type = "number")]
    pub fetched_at: i64,
}

#[derive(Serialize, Clone, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct PullCommentView {
    pub author: String,
    pub author_avatar_url: String,
    pub body: String,
    pub created_at: String,
}

#[derive(Serialize, Clone, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct PullCardView {
    pub pull: PullView,
    pub body: String,
    pub labels: Vec<String>,
    pub changed_files: u32,
    pub additions: u32,
    pub deletions: u32,
    pub comments: Vec<PullCommentView>,
}

pub fn build_pull_view(pull: &gitspy_hosts::pulls::PullSummary, my_login: &str) -> PullView {
    use gitspy_hosts::pulls::{groups_of, Group};
    let groups = groups_of(pull, my_login);

    PullView {
        number: pull.number as u32,
        title: pull.title.clone(),
        draft: pull.draft,
        author: pull.author.clone(),
        author_avatar_url: pull.author_avatar_url.clone(),
        head_branch: pull.head_branch.clone(),
        base_branch: pull.base_branch.clone(),
        from_fork: pull.from_fork,
        updated_at: pull.updated_at.clone(),
        mine: groups.contains(&Group::Mine),
        assigned_to_me: groups.contains(&Group::Assigned),
        awaiting_my_review: groups.contains(&Group::AwaitingMyReview),
    }
}

#[derive(Serialize, Clone, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct AccountView {
    pub host: String,
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: String,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct DeviceView {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub interval: u32,
    pub expires_in: u32,
}

pub fn build_device(device: gitspy_hosts::github::Device) -> DeviceView {
    DeviceView {
        device_code: device.device_code,
        user_code: device.user_code,
        verification_uri: device.verification_uri,
        interval: device.interval as u32,
        expires_in: device.expires_in as u32,
    }
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct RepoListingView {
    pub full_name: String,
    pub description: Option<String>,
    pub private: bool,
    pub clone_url: String,
    pub ssh_url: String,
    pub pushed_at: Option<String>,
    pub owner_avatar_url: String,
}

pub fn build_repo_listing(repo: &gitspy_hosts::github::Repo) -> RepoListingView {
    RepoListingView {
        full_name: repo.full_name.clone(),
        description: repo.description.clone(),
        private: repo.private,
        clone_url: repo.clone_url.clone(),
        ssh_url: repo.ssh_url.clone(),
        pushed_at: repo.pushed_at.clone(),
        owner_avatar_url: repo.owner_avatar_url.clone(),
    }
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct CloneStepView {
    pub stage: String,
    pub percent: u8,
    pub overall: u8,
}

pub fn build_clone_step(step: gitspy_exec::progress::Step) -> CloneStepView {
    CloneStepView {
        stage: step.stage.code().to_string(),
        percent: step.percent,
        overall: step.overall(),
    }
}

pub fn build_account(account: gitspy_hosts::Account) -> AccountView {
    AccountView {
        host: account.host,
        login: account.login,
        name: account.name,
        avatar_url: account.avatar_url,
    }
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct TipView {
    pub structure_changed: bool,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct DiffSides {
    pub before: String,
    pub after: String,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct ConflictFileView {
    pub base: String,
    pub ours: String,
    pub theirs: String,
    pub merged: String,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct WindowView {
    pub start: u32,
    pub rows: Vec<RowView>,
    pub seg_offsets: Vec<u32>,
    pub seg_kind: Vec<u8>,
    pub seg_from: Vec<u16>,
    pub seg_to: Vec<u16>,
    pub seg_colour: Vec<u8>,
}

fn node_kind_code(kind: NodeKind) -> u8 {
    match kind {
        NodeKind::Normal => node_kind::NORMAL,
        NodeKind::Merge => node_kind::MERGE,
        NodeKind::Root => node_kind::ROOT,
        NodeKind::Open => node_kind::OPEN,
    }
}

fn ref_kind_view(kind: RefKind) -> RefKindView {
    match kind {
        RefKind::LocalBranch => RefKindView::LocalBranch,
        RefKind::RemoteBranch => RefKindView::RemoteBranch,
        RefKind::Tag => RefKindView::Tag,
        RefKind::Stash => RefKindView::Stash,
    }
}

pub fn build_ref_views(refs: &[RefLine], rows: &HashMap<String, u32>) -> Vec<RefView> {
    refs.iter()
        .filter_map(|r| {
            rows.get(&r.oid).map(|&commit| RefView {
                name: r.name.clone(),
                kind: ref_kind_view(r.kind),
                commit,
                oid: r.oid.clone(),
                is_head: r.is_head,
                upstream: r.upstream.clone(),
                ahead: r.ahead,
                behind: r.behind,
                gone: r.gone,
            })
        })
        .collect()
}

#[allow(clippy::too_many_arguments)]
pub fn build_repo_view(
    path: &str,
    history: &History,
    refs: &[RefLine],
    remotes: Vec<RemoteView>,
    skeleton: &Skeleton,
    minimap: Vec<u32>,
    read_ms: f64,
    layout_ms: f64,
) -> RepoView {
    RepoView {
        path: path.to_string(),
        count: skeleton.len(),
        max_lane: skeleton.max_lane,
        head: history.head,
        truncated: history.truncated,
        read_ms,
        layout_ms,
        minimap,
        minimap_colours: gitspy_core::chunk::minimap_colours(),
        remotes,
        refs: build_ref_views(refs, &history.rows),
    }
}

pub fn build_window_view(start: usize, layout: &Layout, nodes: &[Node]) -> WindowView {
    let mut seg_offsets = Vec::with_capacity(layout.len() + 1);
    let mut seg_kind = Vec::new();
    let mut seg_from = Vec::new();
    let mut seg_to = Vec::new();
    let mut seg_colour = Vec::new();

    seg_offsets.push(0u32);
    for segments in &layout.segments {
        for segment in segments {
            let (kind, from, to, colour) = match segment {
                Segment::Through { lane, colour } => (segment_kind::THROUGH, *lane, *lane, *colour),
                Segment::Branch { from, to, colour } => (segment_kind::BRANCH, *from, *to, *colour),
                Segment::Merge { from, to, colour } => (segment_kind::MERGE, *from, *to, *colour),
            };
            seg_kind.push(kind);
            seg_from.push(from);
            seg_to.push(to);
            seg_colour.push(colour);
        }
        seg_offsets.push(seg_kind.len() as u32);
    }

    let rows = layout
        .rows
        .iter()
        .enumerate()
        .map(|(offset, row)| {
            let index = (start + offset) as u32;
            match &nodes[offset] {
                Node::WorkingTree {
                    added,
                    modified,
                    deleted,
                    conflicts,
                    in_progress,
                } => RowView::WorkingTree {
                    index,
                    lane: row.lane,
                    colour: row.colour,
                    node: node_kind_code(row.kind),
                    added: *added,
                    modified: *modified,
                    deleted: *deleted,
                    conflicts: *conflicts,
                    in_progress: in_progress.clone(),
                },
                Node::Commit(meta) => RowView::Commit {
                    index,
                    lane: row.lane,
                    colour: row.colour,
                    node: node_kind_code(row.kind),
                    hash: meta.hash.clone(),
                    author: meta.author.clone(),
                    email: meta.email.clone(),
                    time: meta.time,
                    subject: meta.subject.clone(),
                    body: meta.body.clone(),
                },
            }
        })
        .collect();

    WindowView {
        start: start as u32,
        rows,
        seg_offsets,
        seg_kind,
        seg_from,
        seg_to,
        seg_colour,
    }
}

#[cfg(test)]
mod working_tree_view_tests {
    use super::*;
    use gitspy_exec::status::{InProgress, Side, StatusEntry, WorkingTree};

    #[test]
    fn the_panel_learns_about_a_merge_and_its_conflicts_from_the_view() {
        let tree = WorkingTree {
            branch: Some("main".to_string()),
            in_progress: Some(InProgress::Merge),
            entries: vec![StatusEntry {
                side: Side::Unstaged,
                letter: 'U',
                path: "story.txt".to_string(),
                old_path: None,
            }],
            ..WorkingTree::default()
        };

        let view = build_working_tree(tree, vec![], None);
        assert_eq!(
            view.in_progress.as_deref(),
            Some("merge"),
            "без этого панели не из чего показать плашку слияния"
        );
        assert_eq!(
            view.conflicts, 1,
            "готовность продолжить слияние определяется числом конфликтов"
        );
    }

    #[test]
    fn a_calm_tree_reports_no_merge_and_no_conflicts() {
        let view = build_working_tree(WorkingTree::default(), vec![], None);
        assert_eq!(view.in_progress, None);
        assert_eq!(view.conflicts, 0);
        assert!(view.merging.is_none());
    }

    #[test]
    fn the_merge_heading_reaches_the_panel_as_branch_and_subject() {
        let heading = gitspy_exec::MergeHeading {
            from: Some("feature".to_string()),
            subject: "Merge branch 'feature'".to_string(),
        };
        let view = build_working_tree(WorkingTree::default(), vec![], Some(heading));
        let merging = view.merging.expect("панель слияния без заголовка слепа");
        assert_eq!(merging.from.as_deref(), Some("feature"));
        assert_eq!(merging.subject, "Merge branch 'feature'");
    }
}
