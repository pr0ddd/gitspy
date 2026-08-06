# План: генерация сообщения коммита локальной моделью (Ollama / LM Studio)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Цель:** кнопка-искорка у поля Summary шлёт staged-дифф локальной модели (Ollama или LM Studio) и заполняет заголовок и описание коммита; провайдер, адрес и модель настраиваются в новой секции настроек.

**Архитектура:** новый крейт `crates/gitspy-ai` (адаптеры провайдеров, обрезка диффа, промпт, разбор ответа — всё чистое тестируется без сети), метод `staged_diff` в `gitspy-exec`, две команды Tauri в `src-tauri/src/ai.rs`, секция `ai` в `Settings.tsx`, хук в `features/repo`, кнопка в `WorkingTree.tsx`. Спека: `docs/superpowers/specs/2026-08-06-ai-commit-message-design.md`.

**Стек:** Rust (reqwest/rustls, serde, tokio), Tauri 2, React, i18next, vitest.

## Глобальные ограничения

- **Комментариев в коде нет** — ни `//`, ни `///`, ни `/* */`. Объяснение — имя функции или тест.
- Идентификаторы английские, сообщения `assert` русские, коммиты целиком английские, **без трейлеров** (никаких `Co-Authored-By`).
- Строк, видимых пользователю, в коде нет — только ключи i18n; ключи плоские, через точку.
- Rust отдаёт ошибки кодом и параметрами (`ErrorView`), не фразами.
- Весь `invoke` — только в `src/ipc.ts`; типы границы генерируются из Rust (`#[derive(TS)]` → `src/generated/`).
- Иконки — только через `src/icons.ts`, не напрямую из `lucide-react`.
- Никаких `className` с частными значениями вроде `p-[7px]`; только утилиты темы.
- Перед каждым коммитом: `cargo fmt --all`; тесты задачи зелёные.

---

### Task 1: крейт `gitspy-ai` — каркас и `trim_diff`

**Files:**
- Create: `crates/gitspy-ai/Cargo.toml`
- Create: `crates/gitspy-ai/src/lib.rs`
- Create: `crates/gitspy-ai/src/trim.rs`
- Modify: `Cargo.toml` (workspace members)

**Interfaces:**
- Produces: `gitspy_ai::trim::{trim_diff(diff: &str) -> String, FILE_LIMIT: usize, TOTAL_LIMIT: usize}` — Task 3 зовёт `trim_diff` внутри `generate_commit`.

- [ ] **Step 1: каркас крейта**

`Cargo.toml` workspace-корня:

```toml
members = ["crates/gitspy-ai", "crates/gitspy-core", "crates/gitspy-exec", "crates/gitspy-hosts", "crates/gitspy-repo", "src-tauri"]
```

`crates/gitspy-ai/Cargo.toml`:

```toml
[package]
name = "gitspy-ai"
version = "0.1.0"
edition = "2021"
rust-version = "1.85"

[dependencies]
reqwest = { version = "0.13", default-features = false, features = ["rustls", "webpki-roots", "json", "charset", "http2"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["time"] }
```

`crates/gitspy-ai/src/lib.rs` пока:

```rust
#![forbid(unsafe_code)]

pub mod trim;

pub use trim::trim_diff;
```

- [ ] **Step 2: падающие тесты `trim_diff`**

В конец `crates/gitspy-ai/src/trim.rs` (сам модуль пока пустой — только `mod tests`, поэтому компиляция упадёт, это и есть красный шаг):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn file_chunk(path: &str, body_lines: usize) -> String {
        let mut chunk = format!(
            "diff --git a/{path} b/{path}\nindex 0000000..1111111 100644\n--- a/{path}\n+++ b/{path}\n@@ -1,1 +1,{body_lines} @@\n"
        );
        for n in 0..body_lines {
            chunk.push_str(&format!("+added line {n}\n"));
        }
        chunk
    }

    #[test]
    fn small_diff_passes_unchanged() {
        let diff = file_chunk("src/a.rs", 3);
        assert_eq!(trim_diff(&diff), diff, "маленький дифф не трогаем");
    }

    #[test]
    fn oversized_file_is_cut_at_file_limit() {
        let diff = file_chunk("src/big.rs", 400);
        let trimmed = trim_diff(&diff);
        assert!(trimmed.len() < diff.len(), "файл больше лимита обязан ужаться");
        assert!(trimmed.contains("diff --git a/src/big.rs"), "заголовок файла остаётся");
        assert!(trimmed.contains("[truncated]"), "об урезании сказано явно");
        assert!(trimmed.len() <= FILE_LIMIT + 200, "хвост за лимитом не протекает");
    }

    #[test]
    fn binary_file_becomes_a_stub() {
        let diff = "diff --git a/logo.png b/logo.png\nindex 0000000..1111111 100644\nBinary files a/logo.png and b/logo.png differ\n";
        let trimmed = trim_diff(diff);
        assert!(trimmed.contains("diff --git a/logo.png"), "заголовок файла остаётся");
        assert!(trimmed.contains("[binary file]"), "вместо бинарного тела — заглушка");
        assert!(!trimmed.contains("Binary files"), "сырой маркер git наружу не идёт");
    }

    #[test]
    fn lock_file_becomes_a_stub() {
        let diff = file_chunk("package-lock.json", 50);
        let trimmed = trim_diff(&diff);
        assert!(trimmed.contains("diff --git a/package-lock.json"), "заголовок файла остаётся");
        assert!(trimmed.contains("[lock file]"), "тело lock-файла модели не нужно");
        assert!(!trimmed.contains("added line"), "строки lock-файла выкинуты");
    }

    #[test]
    fn total_limit_collapses_tail_files_to_counted_headers() {
        let mut diff = String::new();
        for n in 0..40 {
            diff.push_str(&file_chunk(&format!("src/file{n}.rs"), 100));
        }
        let trimmed = trim_diff(&diff);
        assert!(trimmed.len() <= TOTAL_LIMIT + 4096, "общий лимит держится");
        for n in 0..40 {
            assert!(
                trimmed.contains(&format!("file{n}.rs")),
                "каждый затронутый файл виден модели хотя бы именем"
            );
        }
        assert!(trimmed.contains("(+100 -0)"), "у свёрнутого файла счётчик строк");
    }
}
```

- [ ] **Step 3: убедиться, что тесты падают**

Run: `cargo test -p gitspy-ai`
Expected: FAIL — `trim_diff`, `FILE_LIMIT`, `TOTAL_LIMIT` не определены.

- [ ] **Step 4: реализация**

`crates/gitspy-ai/src/trim.rs` перед `mod tests`:

```rust
pub const FILE_LIMIT: usize = 4096;
pub const TOTAL_LIMIT: usize = 49152;

const LOCK_FILES: &[&str] = &[
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "Cargo.lock",
    "composer.lock",
    "Gemfile.lock",
    "go.sum",
    "poetry.lock",
];

pub fn trim_diff(diff: &str) -> String {
    let mut out = String::new();
    for chunk in split_files(diff) {
        let shaped = shape_file(chunk);
        if out.len() + shaped.len() > TOTAL_LIMIT {
            out.push_str(&counted_header(chunk));
        } else {
            out.push_str(&shaped);
        }
    }
    out
}

fn split_files(diff: &str) -> Vec<&str> {
    let mut starts: Vec<usize> = diff
        .lines()
        .scan(0usize, |offset, line| {
            let here = *offset;
            *offset += line.len() + 1;
            Some((here, line))
        })
        .filter(|(_, line)| line.starts_with("diff --git "))
        .map(|(offset, _)| offset)
        .collect();
    starts.push(diff.len());
    starts
        .windows(2)
        .map(|pair| &diff[pair[0]..pair[1]])
        .collect()
}

fn file_path(chunk: &str) -> &str {
    chunk
        .lines()
        .next()
        .and_then(|header| header.split(" b/").nth(1))
        .unwrap_or("")
}

fn header_of(chunk: &str) -> &str {
    chunk.lines().next().unwrap_or("")
}

fn is_binary(chunk: &str) -> bool {
    chunk.contains("\nBinary files ") || chunk.contains("\nGIT binary patch")
}

fn is_lock_file(path: &str) -> bool {
    let name = path.rsplit('/').next().unwrap_or(path);
    LOCK_FILES.contains(&name)
}

fn added_removed(chunk: &str) -> (usize, usize) {
    let added = chunk
        .lines()
        .filter(|line| line.starts_with('+') && !line.starts_with("+++"))
        .count();
    let removed = chunk
        .lines()
        .filter(|line| line.starts_with('-') && !line.starts_with("---"))
        .count();
    (added, removed)
}

fn counted_header(chunk: &str) -> String {
    let (added, removed) = added_removed(chunk);
    format!("{} (+{added} -{removed})\n", header_of(chunk))
}

fn cut_at_line_boundary(chunk: &str, limit: usize) -> &str {
    if chunk.len() <= limit {
        return chunk;
    }
    let cut = chunk[..limit].rfind('\n').map(|at| at + 1).unwrap_or(limit);
    &chunk[..cut]
}

fn shape_file(chunk: &str) -> String {
    if is_lock_file(file_path(chunk)) {
        return format!("{}\n[lock file]\n", header_of(chunk));
    }
    if is_binary(chunk) {
        return format!("{}\n[binary file]\n", header_of(chunk));
    }
    if chunk.len() > FILE_LIMIT {
        return format!("{}[truncated]\n", cut_at_line_boundary(chunk, FILE_LIMIT));
    }
    chunk.to_string()
}
```

- [ ] **Step 5: тесты зелёные**

Run: `cargo test -p gitspy-ai`
Expected: PASS, 5 тестов.

- [ ] **Step 6: коммит**

```bash
cargo fmt --all
git add Cargo.toml Cargo.lock crates/gitspy-ai
git commit -m "gitspy-ai crate: trim staged diff to model-sized input"
```

---

### Task 2: `gitspy-ai` — промпт и разбор ответа

**Files:**
- Create: `crates/gitspy-ai/src/prompt.rs`
- Create: `crates/gitspy-ai/src/parse.rs`
- Modify: `crates/gitspy-ai/src/lib.rs`

**Interfaces:**
- Produces: `Prompt { system: String, user: String }`, `build_prompt(diff: &str) -> Prompt`, `CommitDraft { summary: String, description: String }`, `parse_draft(text: &str) -> Option<CommitDraft>` — Task 3 использует все четыре.

- [ ] **Step 1: падающие тесты**

`crates/gitspy-ai/src/prompt.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn diff_goes_to_user_message_rules_to_system() {
        let prompt = build_prompt("diff --git a/x b/x\n+new line\n");
        assert!(prompt.user.contains("+new line"), "дифф лежит в пользовательском сообщении");
        assert!(prompt.system.contains("summary"), "правила формата лежат в системном");
        assert!(prompt.system.contains("72"), "лимит длины заголовка назван явно");
        assert!(!prompt.system.contains("+new line"), "дифф в системное сообщение не течёт");
    }
}
```

`crates/gitspy-ai/src/parse.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_json_parses() {
        let draft = parse_draft(r#"{"summary": "Fix lane collapse", "description": "The layout dropped merges."}"#)
            .expect("чистый JSON разбирается");
        assert_eq!(draft.summary, "Fix lane collapse");
        assert_eq!(draft.description, "The layout dropped merges.");
    }

    #[test]
    fn json_inside_code_fence_parses() {
        let text = "```json\n{\"summary\": \"Add tests\", \"description\": \"\"}\n```";
        let draft = parse_draft(text).expect("JSON в код-фенсах разбирается");
        assert_eq!(draft.summary, "Add tests");
    }

    #[test]
    fn json_with_chatter_around_parses() {
        let text = "Here is your commit message:\n{\"summary\": \"Rename module\", \"description\": \"Old name lied.\"}\nHope it helps!";
        let draft = parse_draft(text).expect("болтовня вокруг JSON не мешает");
        assert_eq!(draft.summary, "Rename module");
    }

    #[test]
    fn missing_description_defaults_to_empty() {
        let draft = parse_draft(r#"{"summary": "Bump version"}"#).expect("описание опционально");
        assert_eq!(draft.description, "");
    }

    #[test]
    fn garbage_is_rejected() {
        assert!(parse_draft("I cannot help with that.").is_none(), "не-JSON — отказ, не паника");
    }

    #[test]
    fn empty_summary_is_rejected() {
        assert!(
            parse_draft(r#"{"summary": "  ", "description": "x"}"#).is_none(),
            "пустой заголовок — это не сообщение коммита"
        );
    }
}
```

`lib.rs`:

```rust
#![forbid(unsafe_code)]

pub mod parse;
pub mod prompt;
pub mod trim;

pub use parse::{parse_draft, CommitDraft};
pub use prompt::{build_prompt, Prompt};
pub use trim::trim_diff;
```

- [ ] **Step 2: убедиться, что тесты падают**

Run: `cargo test -p gitspy-ai`
Expected: FAIL — модули пустые, типы не определены.

- [ ] **Step 3: реализация**

`prompt.rs` перед тестами:

```rust
pub struct Prompt {
    pub system: String,
    pub user: String,
}

const RULES: &str = "You write git commit messages from staged diffs. Respond with strict JSON only, no markdown, no code fences: {\"summary\": \"...\", \"description\": \"...\"}. The summary is in English, imperative mood, at most 72 characters, no trailing period, and states what the change does. The description is one to four plain sentences explaining what changed and why; use an empty string when the change is self-evident. Describe only what the diff shows.";

pub fn build_prompt(diff: &str) -> Prompt {
    Prompt {
        system: RULES.to_string(),
        user: format!("Staged diff:\n\n{diff}"),
    }
}
```

`parse.rs` перед тестами:

```rust
use serde::Deserialize;

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct CommitDraft {
    pub summary: String,
    #[serde(default)]
    pub description: String,
}

pub fn parse_draft(text: &str) -> Option<CommitDraft> {
    let candidate = braced_slice(text)?;
    let draft: CommitDraft = serde_json::from_str(candidate).ok()?;
    let summary = draft.summary.trim();
    if summary.is_empty() {
        return None;
    }
    Some(CommitDraft {
        summary: summary.to_string(),
        description: draft.description.trim().to_string(),
    })
}

fn braced_slice(text: &str) -> Option<&str> {
    let start = text.find('{')?;
    let end = text.rfind('}')?;
    if end < start {
        return None;
    }
    Some(&text[start..=end])
}
```

- [ ] **Step 4: тесты зелёные**

Run: `cargo test -p gitspy-ai`
Expected: PASS, 12 тестов (5 из Task 1 + 7 новых).

- [ ] **Step 5: коммит**

```bash
cargo fmt --all
git add crates/gitspy-ai
git commit -m "gitspy-ai: fixed prompt and lenient JSON draft parsing"
```

---

### Task 3: `gitspy-ai` — провайдеры и HTTP

**Files:**
- Create: `crates/gitspy-ai/src/provider.rs`
- Create: `crates/gitspy-ai/src/client.rs`
- Modify: `crates/gitspy-ai/src/lib.rs`

**Interfaces:**
- Consumes: `trim_diff`, `build_prompt`, `parse_draft`, `CommitDraft` из Task 1–2.
- Produces (граница для Task 5):
  - `AiProvider { Ollama, LmStudio }` c `AiProvider::from_id(&str) -> Option<AiProvider>` (id: `"ollama"`, `"lmstudio"`)
  - `AiError { Unreachable { detail: String }, BadResponse { detail: String } }` c `code() -> &'static str` (`"ai.unreachable"` / `"ai.badResponse"`) и `detail() -> String`
  - `async fn list_models(provider: AiProvider, base_url: &str) -> Result<Vec<String>, AiError>`
  - `async fn generate_commit(provider: AiProvider, base_url: &str, model: &str, diff: &str) -> Result<CommitDraft, AiError>`

- [ ] **Step 1: падающие тесты чистой части**

`crates/gitspy-ai/src/provider.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::prompt::build_prompt;

    #[test]
    fn ids_round_trip() {
        assert_eq!(AiProvider::from_id("ollama"), Some(AiProvider::Ollama), "ollama узнаётся по id");
        assert_eq!(AiProvider::from_id("lmstudio"), Some(AiProvider::LmStudio), "lmstudio узнаётся по id");
        assert_eq!(AiProvider::from_id("openai"), None, "чужой id — отказ, не паника");
    }

    #[test]
    fn urls_tolerate_trailing_slash() {
        assert_eq!(
            chat_url("http://hulk:1234/"),
            "http://hulk:1234/v1/chat/completions",
            "хвостовой слэш адреса не удваивается"
        );
        assert_eq!(models_url("http://localhost:11434"), "http://localhost:11434/v1/models");
    }

    #[test]
    fn chat_body_carries_model_and_both_messages() {
        let body = chat_body(AiProvider::Ollama, "qwen2.5-coder", &build_prompt("diff"));
        assert_eq!(body["model"], "qwen2.5-coder", "имя модели уходит как есть");
        assert_eq!(body["messages"][0]["role"], "system");
        assert_eq!(body["messages"][1]["role"], "user");
        assert_eq!(body["stream"], false, "стриминг выключен: ответ разбирается целиком");
    }

    #[test]
    fn response_format_differs_per_provider() {
        let prompt = build_prompt("diff");
        let ollama = chat_body(AiProvider::Ollama, "m", &prompt);
        let lmstudio = chat_body(AiProvider::LmStudio, "m", &prompt);
        assert_eq!(ollama["response_format"]["type"], "json_object", "Ollama понимает json_object");
        assert_eq!(
            lmstudio["response_format"]["type"], "json_schema",
            "LM Studio строже: полная json-схема"
        );
        assert_eq!(
            lmstudio["response_format"]["json_schema"]["schema"]["required"],
            serde_json::json!(["summary", "description"]),
            "схема требует оба поля"
        );
    }
}
```

- [ ] **Step 2: убедиться, что тесты падают**

Run: `cargo test -p gitspy-ai`
Expected: FAIL — `AiProvider`, `chat_url`, `models_url`, `chat_body` не определены.

- [ ] **Step 3: реализация провайдеров**

`provider.rs` перед тестами:

```rust
use crate::prompt::Prompt;
use serde_json::{json, Value};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AiProvider {
    Ollama,
    LmStudio,
}

impl AiProvider {
    pub fn from_id(id: &str) -> Option<Self> {
        match id {
            "ollama" => Some(Self::Ollama),
            "lmstudio" => Some(Self::LmStudio),
            _ => None,
        }
    }
}

pub fn chat_url(base_url: &str) -> String {
    format!("{}/v1/chat/completions", base_url.trim_end_matches('/'))
}

pub fn models_url(base_url: &str) -> String {
    format!("{}/v1/models", base_url.trim_end_matches('/'))
}

pub fn chat_body(provider: AiProvider, model: &str, prompt: &Prompt) -> Value {
    json!({
        "model": model,
        "messages": [
            { "role": "system", "content": prompt.system },
            { "role": "user", "content": prompt.user }
        ],
        "stream": false,
        "temperature": 0.2,
        "response_format": response_format(provider),
    })
}

fn response_format(provider: AiProvider) -> Value {
    match provider {
        AiProvider::Ollama => json!({ "type": "json_object" }),
        AiProvider::LmStudio => json!({
            "type": "json_schema",
            "json_schema": {
                "name": "commit_draft",
                "strict": true,
                "schema": {
                    "type": "object",
                    "properties": {
                        "summary": { "type": "string" },
                        "description": { "type": "string" }
                    },
                    "required": ["summary", "description"]
                }
            }
        }),
    }
}
```

- [ ] **Step 4: HTTP-клиент**

`crates/gitspy-ai/src/client.rs` (тонкий транспорт, сетевых тестов нет — вся логика уже покрыта чистыми тестами):

```rust
use crate::parse::{parse_draft, CommitDraft};
use crate::prompt::build_prompt;
use crate::provider::{chat_body, chat_url, models_url, AiProvider};
use crate::trim::trim_diff;
use serde::Deserialize;
use std::time::Duration;

const LIST_TIMEOUT: Duration = Duration::from_secs(10);
const GENERATE_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Debug)]
pub enum AiError {
    Unreachable { detail: String },
    BadResponse { detail: String },
}

impl AiError {
    pub fn code(&self) -> &'static str {
        match self {
            AiError::Unreachable { .. } => "ai.unreachable",
            AiError::BadResponse { .. } => "ai.badResponse",
        }
    }

    pub fn detail(&self) -> String {
        match self {
            AiError::Unreachable { detail } | AiError::BadResponse { detail } => detail.clone(),
        }
    }
}

#[derive(Deserialize)]
struct ModelList {
    data: Vec<ModelEntry>,
}

#[derive(Deserialize)]
struct ModelEntry {
    id: String,
}

#[derive(Deserialize)]
struct ChatReply {
    choices: Vec<Choice>,
}

#[derive(Deserialize)]
struct Choice {
    message: ChoiceMessage,
}

#[derive(Deserialize)]
struct ChoiceMessage {
    content: String,
}

fn unreachable(error: reqwest::Error) -> AiError {
    AiError::Unreachable {
        detail: error.to_string(),
    }
}

async fn read_ok(response: reqwest::Response) -> Result<String, AiError> {
    let status = response.status();
    let text = response.text().await.map_err(unreachable)?;
    if !status.is_success() {
        return Err(AiError::Unreachable {
            detail: format!("{status}: {text}"),
        });
    }
    Ok(text)
}

pub async fn list_models(provider: AiProvider, base_url: &str) -> Result<Vec<String>, AiError> {
    let _ = provider;
    let client = reqwest::Client::builder()
        .timeout(LIST_TIMEOUT)
        .build()
        .map_err(unreachable)?;
    let response = client.get(models_url(base_url)).send().await.map_err(unreachable)?;
    let text = read_ok(response).await?;
    let list: ModelList = serde_json::from_str(&text).map_err(|e| AiError::BadResponse {
        detail: format!("{e}: {text}"),
    })?;
    Ok(list.data.into_iter().map(|entry| entry.id).collect())
}

pub async fn generate_commit(
    provider: AiProvider,
    base_url: &str,
    model: &str,
    diff: &str,
) -> Result<CommitDraft, AiError> {
    let prompt = build_prompt(&trim_diff(diff));
    let client = reqwest::Client::builder()
        .timeout(GENERATE_TIMEOUT)
        .build()
        .map_err(unreachable)?;
    let response = client
        .post(chat_url(base_url))
        .json(&chat_body(provider, model, &prompt))
        .send()
        .await
        .map_err(unreachable)?;
    let text = read_ok(response).await?;
    let reply: ChatReply = serde_json::from_str(&text).map_err(|e| AiError::BadResponse {
        detail: format!("{e}: {text}"),
    })?;
    let content = reply
        .choices
        .first()
        .map(|choice| choice.message.content.as_str())
        .unwrap_or("");
    parse_draft(content).ok_or_else(|| AiError::BadResponse {
        detail: content.to_string(),
    })
}
```

`lib.rs` целиком:

```rust
#![forbid(unsafe_code)]

pub mod client;
pub mod parse;
pub mod prompt;
pub mod provider;
pub mod trim;

pub use client::{generate_commit, list_models, AiError};
pub use parse::{parse_draft, CommitDraft};
pub use prompt::{build_prompt, Prompt};
pub use provider::AiProvider;
pub use trim::trim_diff;
```

- [ ] **Step 5: тесты зелёные, clippy чистый**

Run: `cargo test -p gitspy-ai && cargo clippy -p gitspy-ai --all-targets -- -D warnings`
Expected: PASS. Если clippy ругается на `let _ = provider;` — заменить параметр на `_provider: AiProvider` нельзя (имя — часть интерфейса адаптера); оставить `let _ = provider;` допустимо, clippy это не флагует.

- [ ] **Step 6: коммит**

```bash
cargo fmt --all
git add crates/gitspy-ai Cargo.lock
git commit -m "gitspy-ai: provider adapters and OpenAI-compatible client"
```

---

### Task 4: `gitspy-exec` — staged-дифф целого репозитория

**Files:**
- Modify: `crates/gitspy-exec/src/lib.rs` (рядом с `diff_unified`, ~строка 506)
- Create: `crates/gitspy-exec/tests/staged.rs`

**Interfaces:**
- Produces: `Git::staged_diff(&self, repo: &Path) -> Result<String, Error>` — Task 5 зовёт из команды Tauri.

- [ ] **Step 1: падающий тест**

`crates/gitspy-exec/tests/staged.rs` (фикстурный стиль — как в `tests/hunks.rs`):

```rust
use gitspy_exec::Git;
use std::path::Path;
use std::process::Command;
use tempfile::TempDir;

fn run(dir: &Path, args: &[&str]) {
    let out = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_SYSTEM", "/dev/null")
        .env("GIT_AUTHOR_NAME", "Test")
        .env("GIT_AUTHOR_EMAIL", "test@example.com")
        .env("GIT_COMMITTER_NAME", "Test")
        .env("GIT_COMMITTER_EMAIL", "test@example.com")
        .output()
        .expect("git запускается");
    assert!(out.status.success(), "команда фикстуры прошла");
}

fn write(dir: &Path, path: &str, text: &str) {
    std::fs::write(dir.join(path), text).expect("файл записан");
}

fn git() -> Git {
    Git::discover().expect("git найден")
}

#[test]
fn staged_diff_shows_only_the_index() {
    let dir = TempDir::new().expect("временный каталог");
    run(dir.path(), &["init", "-b", "main"]);
    write(dir.path(), "staged.txt", "old\n");
    run(dir.path(), &["add", "-A"]);
    run(dir.path(), &["commit", "-m", "base"]);

    write(dir.path(), "staged.txt", "new staged\n");
    run(dir.path(), &["add", "staged.txt"]);
    write(dir.path(), "unstaged.txt", "loose change\n");

    let diff = git().staged_diff(dir.path()).expect("дифф читается");
    assert!(diff.contains("+new staged"), "застейдженная правка в диффе");
    assert!(!diff.contains("loose change"), "незастейдженное в дифф не попадает");
}

#[test]
fn clean_index_gives_empty_diff() {
    let dir = TempDir::new().expect("временный каталог");
    run(dir.path(), &["init", "-b", "main"]);
    write(dir.path(), "a.txt", "content\n");
    run(dir.path(), &["add", "-A"]);
    run(dir.path(), &["commit", "-m", "base"]);

    let diff = git().staged_diff(dir.path()).expect("дифф читается");
    assert_eq!(diff.trim(), "", "чистый индекс — пустой дифф, а не ошибка");
}
```

- [ ] **Step 2: убедиться, что тест падает**

Run: `cargo test -p gitspy-exec --test staged`
Expected: FAIL — метода `staged_diff` нет.

- [ ] **Step 3: реализация**

В `crates/gitspy-exec/src/lib.rs` сразу после `diff_unified` (~строка 513), тем же приёмом (`read_raw` уже есть и используется соседями):

```rust
pub fn staged_diff(&self, repo: &Path) -> Result<String, Error> {
    self.read_raw(repo, &["diff", "--cached", "--no-color", "--no-ext-diff"])
}
```

- [ ] **Step 4: тесты зелёные**

Run: `cargo test -p gitspy-exec --test staged`
Expected: PASS, 2 теста.

- [ ] **Step 5: коммит**

```bash
cargo fmt --all
git add crates/gitspy-exec
git commit -m "gitspy-exec: whole-repo staged diff for commit generation"
```

---

### Task 5: граница — команды Tauri, ipc, типы, коды ошибок

**Files:**
- Modify: `src-tauri/Cargo.toml` (зависимость `gitspy-ai`)
- Modify: `src-tauri/src/views.rs` (`CommitDraftView`)
- Create: `src-tauri/src/ai.rs`
- Modify: `src-tauri/src/main.rs` (модуль + регистрация команд, ~строка 78)
- Modify: `src/ipc.ts`
- Modify: `src/types.ts`
- Modify: `src/locales/en/errors.json`

**Interfaces:**
- Consumes: `gitspy_ai::{AiProvider, AiError, list_models, generate_commit}` (Task 3), `Git::staged_diff` (Task 4), `crate::state::{on_reader, exec_error}` и `AppState::git()` (существующие, `src-tauri/src/state.rs:115-123`).
- Produces (для Task 6–7):
  - `ipc.aiListModels(provider: AiProviderId, baseUrl: string) => Promise<string[]>`
  - `ipc.aiGenerateCommit(repo: string, provider: AiProviderId, baseUrl: string, model: string) => Promise<CommitDraftView>`
  - `type AiProviderId = 'ollama' | 'lmstudio'` и `CommitDraftView { summary: string; description: string }` в `@/types`.

- [ ] **Step 1: зависимость и view**

`src-tauri/Cargo.toml`, в `[dependencies]` рядом с `gitspy-hosts`:

```toml
gitspy-ai = { path = "../crates/gitspy-ai" }
```

`src-tauri/src/views.rs`, рядом с остальными view:

```rust
#[derive(Serialize, Clone, TS)]
#[ts(export, export_to = "../../src/generated/")]
pub struct CommitDraftView {
    pub summary: String,
    pub description: String,
}
```

- [ ] **Step 2: команды**

`src-tauri/src/ai.rs`:

```rust
use crate::state::{exec_error, on_reader, AppState};
use crate::views::{CommitDraftView, ErrorView};
use gitspy_ai::{AiError, AiProvider};
use std::path::PathBuf;
use tauri::State;

fn provider_of(id: &str) -> Result<AiProvider, ErrorView> {
    AiProvider::from_id(id).ok_or_else(|| ErrorView::new("ai.unknownProvider").param("provider", id))
}

fn ai_error(base_url: &str, error: AiError) -> ErrorView {
    ErrorView::new(error.code())
        .param("url", base_url)
        .detail(error.detail())
}

#[tauri::command]
pub async fn ai_list_models(provider: String, base_url: String) -> Result<Vec<String>, ErrorView> {
    let provider = provider_of(&provider)?;
    gitspy_ai::list_models(provider, &base_url)
        .await
        .map_err(|e| ai_error(&base_url, e))
}

#[tauri::command]
pub async fn ai_generate_commit(
    repo: String,
    provider: String,
    base_url: String,
    model: String,
    state: State<'_, AppState>,
) -> Result<CommitDraftView, ErrorView> {
    let provider = provider_of(&provider)?;
    let git = state.git()?;
    let path = PathBuf::from(&repo);
    let diff = on_reader(move || git.staged_diff(&path).map_err(exec_error)).await?;
    if diff.trim().is_empty() {
        return Err(ErrorView::new("ai.nothingStaged"));
    }
    let draft = gitspy_ai::generate_commit(provider, &base_url, &model, &diff)
        .await
        .map_err(|e| ai_error(&base_url, e))?;
    Ok(CommitDraftView {
        summary: draft.summary,
        description: draft.description,
    })
}
```

Если `on_reader` или `exec_error` в `state.rs` не `pub` — сделать `pub` (они уже зовутся из `repo_commands.rs`; проверить фактическую видимость и путь импорта, поправить `use` соответственно).

`src-tauri/src/main.rs`: добавить `mod ai;` к списку модулей и две строки в `generate_handler!` после `state::set_autofetch_minutes`:

```rust
ai::ai_list_models,
ai::ai_generate_commit
```

- [ ] **Step 3: пересборка типов границы**

Run: `cargo test -p gitspy-app`
Expected: PASS; появился `src/generated/CommitDraftView.ts`.

- [ ] **Step 4: фронтовая сторона границы**

`src/types.ts`: к переэкспортам добавить

```ts
export type { CommitDraftView } from './generated/CommitDraftView';

export type AiProviderId = 'ollama' | 'lmstudio';
```

`src/ipc.ts`: импортировать `CommitDraftView`, `AiProviderId` из `@/types` и добавить

```ts
export const aiListModels = (provider: AiProviderId, baseUrl: string) =>
  invoke<string[]>('ai_list_models', { provider, baseUrl });

export const aiGenerateCommit = (
  repo: string,
  provider: AiProviderId,
  baseUrl: string,
  model: string,
) => invoke<CommitDraftView>('ai_generate_commit', { repo, provider, baseUrl, model });
```

`src/locales/en/errors.json`, по алфавиту:

```json
"ai.badResponse": "The model reply did not contain a commit message",
"ai.nothingStaged": "Stage changes to generate a commit message",
"ai.unknownProvider": "Unknown AI provider: {{provider}}",
"ai.unreachable": "Could not reach the AI server at {{url}}",
```

- [ ] **Step 5: проверка границы**

Run: `npm run boundary:check && npm run i18n:check && cargo clippy -p gitspy-app --all-targets -- -D warnings`
Expected: всё зелёное.

- [ ] **Step 6: коммит**

```bash
cargo fmt --all
git add src-tauri src/ipc.ts src/types.ts src/generated/CommitDraftView.ts src/locales/en/errors.json Cargo.lock
git commit -m "Boundary: ai_list_models and ai_generate_commit commands"
```

---

### Task 6: настройки — секция AI

**Files:**
- Modify: `src/settingsModel.ts`
- Modify: `src/icons.ts`
- Modify: `src/widgets/Settings.tsx`
- Modify: `src/locales/en/common.json`
- Test: `src/widgets/Settings.test.tsx`

**Interfaces:**
- Consumes: `ipc.aiListModels` (Task 5).
- Produces (для Task 7): ключи prefs `SETTINGS.aiProvider = 'ai.provider'`, `SETTINGS.aiBaseUrl = 'ai.baseUrl'`, `SETTINGS.aiModel = 'ai.model'`; `AI_DEFAULT_URLS: Record<AiProviderId, string>`; иконка `Icon.sparkle`.

- [ ] **Step 1: модель настроек и иконка**

`src/settingsModel.ts`: в `SETTINGS` добавить

```ts
  aiProvider: 'ai.provider',
  aiBaseUrl: 'ai.baseUrl',
  aiModel: 'ai.model',
```

и ниже по файлу:

```ts
import type { AiProviderId } from '@/types';

export const AI_DEFAULT_URLS: Record<AiProviderId, string> = {
  ollama: 'http://localhost:11434',
  lmstudio: 'http://localhost:1234',
};

export const AI_PROVIDERS: ReadonlyArray<{ key: AiProviderId; label: string }> = [
  { key: 'ollama', label: 'settings.aiOllama' },
  { key: 'lmstudio', label: 'settings.aiLmStudio' },
];
```

(импорт — в шапку файла, как принято).

`src/icons.ts`: добавить `Sparkles` в импорт из `lucide-react` и запись `sparkle: Sparkles,` в объект `Icon`.

- [ ] **Step 2: падающий тест секции**

В `src/widgets/Settings.test.tsx` — в стиле существующих тестов файла (там уже есть мок `@/ipc` через `vi.mock('@/ipc', async (importOriginal) => …)` — дополнить его полем `aiListModels: vi.fn(() => Promise.resolve(['qwen2.5-coder', 'llama3.1']))`, если мок точечный — расширить):

```tsx
it('ai section: provider switch resets the model and check fills the list', async () => {
  drawSettings();
  fireEvent.click(screen.getByText('AI commit message'));

  expect(screen.getByPlaceholderText('http://localhost:11434')).toBeTruthy();

  fireEvent.click(screen.getByText('Ollama'));
  fireEvent.click(await screen.findByText('LM Studio'));
  expect(screen.getByPlaceholderText('http://localhost:1234')).toBeTruthy();

  fireEvent.click(screen.getByText('Load models'));
  expect(await screen.findByText('qwen2.5-coder')).toBeTruthy();
});
```

(`drawSettings` — использовать хелпер отрисовки, который уже есть в этом файле; если его нет — собрать `render(<TooltipProvider><Settings …/></TooltipProvider>)` с минимальными пропсами по образцу соседних тестов.)

- [ ] **Step 3: убедиться, что тест падает**

Run: `npx vitest run src/widgets/Settings.test.tsx`
Expected: FAIL — секции нет.

- [ ] **Step 4: секция**

`src/widgets/Settings.tsx`:

1. `type SectionKey = 'general' | 'interface' | 'editor' | 'integrations' | 'ai';`
2. В `SECTIONS` пятой строкой: `{ key: 'ai', label: 'settings.ai', icon: 'sparkle' },`
3. В развилку рендера: `… : section === 'ai' ? (<AiSection />) : (<IntegrationsSection …/>)`
4. Компонент (импорты `AI_DEFAULT_URLS`, `AI_PROVIDERS` из `@/settingsModel`, `AiProviderId` из `@/types`, `SETTINGS` уже импортирован):

```tsx
function AiSection() {
  const { t } = useTranslation();
  const [provider, setProvider] = usePref<AiProviderId>(SETTINGS.aiProvider, 'ollama');
  const [baseUrl, setBaseUrl] = usePref<string>(SETTINGS.aiBaseUrl, '');
  const [model, setModel] = usePref<string>(SETTINGS.aiModel, '');
  const [models, setModels] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);

  const url = baseUrl.trim() || AI_DEFAULT_URLS[provider];
  const chosen = AI_PROVIDERS.find((p) => p.key === provider) ?? AI_PROVIDERS[0];

  const pickProvider = (next: string) => {
    setProvider(next as AiProviderId);
    setModels([]);
    setModel('');
  };

  const check = () => {
    setChecking(true);
    ipc
      .aiListModels(provider, url)
      .then((found) => {
        setModels(found);
        if (!found.includes(model)) setModel(found[0] ?? '');
      })
      .catch(notifyError)
      .finally(() => setChecking(false));
  };

  return (
    <div className="space-y-7">
      <SettingRow label={t('settings.aiProvider')} hint={t('settings.aiProviderHint')}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="w-72 justify-between font-normal">
              {t(chosen.label as 'settings.aiOllama')}
              <Icon.chevron className="size-3 rotate-90 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuRadioGroup value={provider} onValueChange={pickProvider}>
              {AI_PROVIDERS.map((entry) => (
                <DropdownMenuRadioItem key={entry.key} value={entry.key}>
                  {t(entry.label as 'settings.aiOllama')}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SettingRow>

      <SettingRow label={t('settings.aiServer')} hint={t('settings.aiServerHint')}>
        <div className="flex w-72 items-center gap-2">
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={AI_DEFAULT_URLS[provider]}
          />
          <Button variant="outline" size="sm" disabled={checking} onClick={check}>
            {checking ? <Icon.waiting className="size-3.5 animate-spin" /> : null}
            {t('settings.aiCheck')}
          </Button>
        </div>
      </SettingRow>

      <SettingRow label={t('settings.aiModel')} hint={t('settings.aiModelHint')}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={models.length === 0 && !model}
              className="w-72 justify-between font-normal"
            >
              <span className="truncate">{model || t('settings.aiNoModel')}</span>
              <Icon.chevron className="size-3 rotate-90 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuRadioGroup value={model} onValueChange={setModel}>
              {models.map((name) => (
                <DropdownMenuRadioItem key={name} value={name}>
                  {name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SettingRow>
    </div>
  );
}
```

`src/locales/en/common.json`, по алфавиту в блок `settings.*`:

```json
"settings.ai": "AI commit message",
"settings.aiCheck": "Load models",
"settings.aiLmStudio": "LM Studio",
"settings.aiModel": "Model",
"settings.aiModelHint": "Loaded from the server. Load models after changing the address.",
"settings.aiNoModel": "No model chosen",
"settings.aiOllama": "Ollama",
"settings.aiProvider": "Provider",
"settings.aiProviderHint": "One provider at a time. The commit button uses whatever is chosen here.",
"settings.aiServer": "Server address",
"settings.aiServerHint": "Where the provider listens. Leave empty for the local default; a LAN machine works too, like http://hulk:1234.",
```

- [ ] **Step 5: тесты зелёные**

Run: `npx vitest run src/widgets/Settings.test.tsx && npm run i18n:check`
Expected: PASS.

- [ ] **Step 6: коммит**

```bash
git add src/settingsModel.ts src/icons.ts src/widgets/Settings.tsx src/widgets/Settings.test.tsx src/locales/en/common.json
git commit -m "Settings: AI section with provider, server and model picker"
```

---

### Task 7: кнопка генерации в форме коммита

**Files:**
- Modify: `src/features/repo/commitMessage.ts` (хук `useGenerateCommit`)
- Modify: `src/features/repo/index.ts` (экспорт хука)
- Modify: `src/widgets/WorkingTree.tsx` (кнопка в `MessageFields`, ~строка 317)
- Modify: `src/locales/en/common.json`
- Test: `src/widgets/WorkingTree.test.tsx`

**Interfaces:**
- Consumes: `ipc.aiGenerateCommit` (Task 5), `SETTINGS.aiProvider/aiBaseUrl/aiModel` и `AI_DEFAULT_URLS` (Task 6), `Icon.sparkle` (Task 6).
- Produces: `useGenerateCommit({ repo, hasStaged, onDraft }) => { readiness: 'ready' | 'needsStaged' | 'needsSetup'; generating: boolean; generate: () => void }`.

- [ ] **Step 1: хук**

В `src/features/repo/commitMessage.ts` (импорты `usePref` из `@/prefs`, `SETTINGS`, `AI_DEFAULT_URLS` из `@/settingsModel`, `AiProviderId` из `@/types` — добавить к существующим):

```ts
export type GenerateReadiness = 'ready' | 'needsStaged' | 'needsSetup';

export function useGenerateCommit({
  repo,
  hasStaged,
  onDraft,
}: {
  repo: string;
  hasStaged: boolean;
  onDraft: (summary: string, description: string) => void;
}) {
  const [provider] = usePref<AiProviderId>(SETTINGS.aiProvider, 'ollama');
  const [baseUrl] = usePref<string>(SETTINGS.aiBaseUrl, '');
  const [model] = usePref<string>(SETTINGS.aiModel, '');
  const [generating, setGenerating] = useState(false);

  const readiness: GenerateReadiness = !model ? 'needsSetup' : !hasStaged ? 'needsStaged' : 'ready';

  const generate = useCallback(() => {
    if (readiness !== 'ready' || generating) return;
    setGenerating(true);
    ipc
      .aiGenerateCommit(repo, provider, baseUrl.trim() || AI_DEFAULT_URLS[provider], model)
      .then((draft) => onDraft(draft.summary, draft.description))
      .catch(notifyError)
      .finally(() => setGenerating(false));
  }, [readiness, generating, repo, provider, baseUrl, model, onDraft]);

  return { readiness, generating, generate };
}
```

В `src/features/repo/index.ts` — добавить `useGenerateCommit` и `GenerateReadiness` к экспортам из `./commitMessage`.

- [ ] **Step 2: падающие тесты кнопки**

В `src/widgets/WorkingTree.test.tsx`: в моки добавить `@/ipc` (файл его пока не мокает — завести рядом с моком `@/features/menus`):

```tsx
vi.mock('@/ipc', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  aiGenerateCommit: vi.fn(() =>
    Promise.resolve({ summary: 'Add parser', description: 'Covers fences.' }),
  ),
}));
```

и тесты (хелперы `treeWith`/`draw` уже в файле; `aria-label` кнопки — `workingTree.generate`):

```tsx
it('generate is disabled without staged files', () => {
  localStorage.setItem('ai.model', JSON.stringify('qwen2.5-coder'));
  draw(treeWith(0), '', () => {});
  const generate = screen.getByLabelText('Generate commit message') as HTMLButtonElement;
  expect(generate.disabled).toBe(true);
});

it('generate is disabled until a model is chosen in settings', () => {
  draw(treeWith(1), '', () => {});
  const generate = screen.getByLabelText('Generate commit message') as HTMLButtonElement;
  expect(generate.disabled).toBe(true);
});

it('generate fills both draft fields from the model reply', async () => {
  localStorage.setItem('ai.model', JSON.stringify('qwen2.5-coder'));
  const onMessage = vi.fn();
  const onDescription = vi.fn();
  draw(treeWith(1), '', () => {}, { onMessage, onDescription });
  fireEvent.click(screen.getByLabelText('Generate commit message'));
  await vi.waitFor(() => expect(onMessage).toHaveBeenCalledWith('Add parser'));
  expect(onDescription).toHaveBeenCalledWith('Covers fences.');
});
```

(Если `usePref` читает не `localStorage`, а другое хранилище — посмотреть в `src/prefs.ts`, как тесты `Settings.test.tsx` подсовывают значения, и сделать так же; `beforeEach(() => localStorage.clear())` там уже есть.)

- [ ] **Step 3: убедиться, что тесты падают**

Run: `npx vitest run src/widgets/WorkingTree.test.tsx`
Expected: FAIL — кнопки нет.

- [ ] **Step 4: кнопка**

`src/widgets/WorkingTree.tsx`:

1. Импорты: `Hint` из `@/components/ui/tooltip`, `useGenerateCommit` из `@/features/repo`.
2. `MessageFields` получает новые пропсы и рисует кнопку поверх поля Summary:

```tsx
function MessageFields({
  message,
  description,
  onMessage,
  onDescription,
  onHotkey,
  generateHint,
  generateReady,
  generating,
  onGenerate,
}: {
  message: string;
  description: string;
  onMessage: (text: string) => void;
  onDescription: (text: string) => void;
  onHotkey: (e: React.KeyboardEvent) => void;
  generateHint: string;
  generateReady: boolean;
  generating: boolean;
  onGenerate: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="relative">
        <input
          value={message}
          onChange={(e) => onMessage(e.target.value)}
          onKeyDown={onHotkey}
          placeholder={t('workingTree.messagePlaceholder')}
          className="bg-fill-1 text-foreground placeholder:text-faint focus:bg-fill-2 w-full rounded-md py-1.5 pl-2.5 pr-9 text-sm outline-none"
        />
        <Hint text={generateHint}>
          <span className="absolute top-1/2 right-1 -translate-y-1/2">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('workingTree.generate')}
              disabled={!generateReady || generating}
              onClick={onGenerate}
            >
              {generating ? (
                <Icon.waiting className="size-3.5 animate-spin" />
              ) : (
                <Icon.sparkle className="size-3.5" />
              )}
            </Button>
          </span>
        </Hint>
      </div>
      <textarea
        value={description}
        onChange={(e) => onDescription(e.target.value)}
        onKeyDown={onHotkey}
        placeholder={t('workingTree.descriptionPlaceholder')}
        rows={3}
        className="bg-fill-1 text-foreground placeholder:text-faint focus:bg-fill-2 w-full resize-none rounded-md px-2.5 py-1.5 text-sm outline-none"
      />
    </>
  );
}
```

(Проверить в `button.tsx`, что размер называется `icon-sm`; если там только `icon`, взять его с `size-7` не добавлять — использовать имеющийся вариант, класс не сочинять.)

3. В `WorkingTree` перед `return`:

```tsx
const ai = useGenerateCommit({
  repo,
  hasStaged: staged.length > 0,
  onDraft: (summary, body) => {
    onMessage(summary);
    onDescription(body);
  },
});
const generateHint =
  ai.readiness === 'needsStaged'
    ? t('workingTree.generateNeedsStaged')
    : ai.readiness === 'needsSetup'
      ? t('workingTree.generateNeedsSetup')
      : t('workingTree.generate');
```

и оба вызова `<MessageFields …/>` (обычная панель и `MergingPanel`) получают новые пропсы; в `MergingPanel` staged-набора нет под рукой — передать туда `generateReady={false}`, `generating={false}`, `onGenerate={() => {}}`, `generateHint={t('workingTree.generateNeedsStaged')}` (во время мержа сообщение и так предзаполнено).

4. `src/locales/en/common.json`:

```json
"workingTree.generate": "Generate commit message",
"workingTree.generateNeedsSetup": "Choose an AI provider and model in Settings first",
"workingTree.generateNeedsStaged": "Stage changes to generate a commit message",
```

- [ ] **Step 5: тесты зелёные**

Run: `npx vitest run src/widgets/WorkingTree.test.tsx && npm run i18n:check`
Expected: PASS.

- [ ] **Step 6: коммит**

```bash
git add src/features/repo src/widgets/WorkingTree.tsx src/widgets/WorkingTree.test.tsx src/locales/en/common.json
git commit -m "Working tree: sparkle button generates the commit draft"
```

---

### Task 8: полная проверка

**Files:** нет новых.

- [ ] **Step 1: весь Rust**

Run: `cargo fmt --all -- --check && cargo clippy --all-targets -- -D warnings && cargo test`
Expected: всё зелёное.

- [ ] **Step 2: весь фронтенд**

Run: `npm run build`
Expected: i18n, boundary, lint, tsc, vitest, vite — всё зелёное.

- [ ] **Step 3: живая проверка**

Запустить `npm run app`, открыть настройки → секция AI: выбрать LM Studio, вписать `http://hulk:1234`, нажать Load models — список наполняется. Застейджить правку, нажать искорку — поля заполняются. Снять стейдж — кнопка гаснет с подсказкой. Это ручной шаг: сеть и живой сервер тестами не покрываются.

- [ ] **Step 4: финальный коммит, если что-то чинилось**

Чинить — в задаче, где сломано, отдельными точечными коммитами.
