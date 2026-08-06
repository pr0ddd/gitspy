#![forbid(unsafe_code)]

pub mod parse;
pub mod prompt;
pub mod trim;

pub use parse::{parse_draft, CommitDraft};
pub use prompt::{build_prompt, Prompt};
pub use trim::trim_diff;
