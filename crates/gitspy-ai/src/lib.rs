#![forbid(unsafe_code)]

pub mod client;
pub mod parse;
pub mod prompt;
pub mod provider;
pub mod trim;

pub use client::{detect_server, generate_commit, AiError, AiServer};
pub use parse::{parse_draft, CommitDraft};
pub use prompt::{build_prompt, Prompt};
pub use provider::AiProvider;
pub use trim::trim_diff;
