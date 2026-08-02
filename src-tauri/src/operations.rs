use gitspy_exec::{Cancel, Event, Git};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, Deserialize, Serialize, TS, PartialEq, Eq)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub enum Operation {
    WriteCommitGraph,
    FetchDryRun,
}

impl Operation {
    pub fn args(&self) -> &'static [&'static str] {
        match self {
            Operation::WriteCommitGraph => &["commit-graph", "write", "--reachable"],
            Operation::FetchDryRun => &["fetch", "--dry-run", "--all"],
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            Operation::WriteCommitGraph => "operation.writeCommitGraph",
            Operation::FetchDryRun => "operation.fetchDryRun",
        }
    }
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Progress {
    #[serde(rename_all = "camelCase")]
    Started { operation: Operation, label: String },
    #[serde(rename_all = "camelCase")]
    Line { stderr: bool, text: String },
    #[serde(rename_all = "camelCase")]
    Finished { code: i32 },
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
#[serde(rename_all = "camelCase")]
pub struct OperationOutcome {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Default)]
pub struct Queue {
    lanes: Mutex<HashMap<String, Arc<Mutex<()>>>>,
}

impl Queue {
    pub fn lane(&self, repo: &str) -> Arc<Mutex<()>> {
        let mut lanes = self.lanes.lock().expect("очередь операций не отравлена");
        lanes.entry(repo.to_string()).or_default().clone()
    }
}

pub fn run(
    git: &Git,
    repo: &Path,
    operation: Operation,
    cancel: &Cancel,
    progress: &mut dyn FnMut(Progress),
) -> Result<OperationOutcome, gitspy_exec::Error> {
    progress(Progress::Started {
        operation,
        label: operation.label().to_string(),
    });

    let outcome = git.run(repo, operation.args(), cancel, &mut |event| match event {
        Event::Line { stderr, text } => progress(Progress::Line { stderr, text }),
        Event::Finished { code } => progress(Progress::Finished { code }),
        Event::Started { .. } => {}
    })?;

    Ok(OperationOutcome {
        code: outcome.code,
        stdout: outcome.stdout,
        stderr: outcome.stderr,
    })
}
