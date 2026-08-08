# ACP-сессии — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Агентские сессии по ACP: клиент на Rust, лента сессии с разрешениями и чекпоинтами, профиль «claude · ACP» в доке терминалов.

**Architecture:** `crates/gitspy-acp` — JSON-RPC (ndjson) поверх stdio адаптера, события через колбэк; чекпоинты — `gitspy-exec` (`git stash create` + `refs/gitspy/checkpoints/*`); `src-tauri/src/acp.rs` — команды `acp_*` и `AcpEventView` (`#[derive(TS)]`); фронт — `entities/agent` (стор, лента, редьюсер), `features/agent` (маппинг событий), `widgets/AgentSessionView` внутри `TerminalDock`. Спека: `docs/superpowers/specs/2026-08-07-acp-sessions-design.md`.

**Tech Stack:** serde/serde_json, дочерний процесс через `std::process` (stdio piped), Tauri `Channel`, ts-rs, zustand.

## Global Constraints

- **Коммитов и пушей нет:** ни `git add`, ни `git commit`, ни `git push`. Незакоммиченная реализация терминала v1 уже лежит в дереве — она нужна как есть, не трогать и не откатывать.
- **Комментариев в коде нет** (ни `//`, ни `///`, ни `/* */`). Идентификаторы английские, `assert`-сообщения русские.
- Строки UI — только ключи i18n (`src/locales/en/common.json`).
- `invoke` — только в `src/ipc.ts`; FSD-импорты строго вниз через фасады `index.ts`.
- Стили — токены и части из `src/parts.tsx`; иконки из `src/icons.ts`.
- TDD: тест падает до реализации. Ворота задач: `cargo clippy --all-targets -- -D warnings`, `cargo fmt --all`, `npx tsc --noEmit`.
- Реального агента и сеть используют только Task 8; остальные — против мок-агента.

---

### Task 1: Крейт `gitspy-acp` — клиент протокола против мок-агента

**Files:**
- Create: `crates/gitspy-acp/Cargo.toml`
- Create: `crates/gitspy-acp/src/lib.rs`
- Create: `crates/gitspy-acp/src/wire.rs`
- Create: `crates/gitspy-acp/tests/client.rs`
- Create: `crates/gitspy-acp/tests/fixtures/mock-agent.mjs`
- Modify: `Cargo.toml` (workspace member)

**Interfaces:**
- Produces:
  - `pub enum AgentEvent { MessageChunk { text: String }, ToolCall { id: String, title: String, status: String }, ToolCallUpdate { id: String, status: String }, PermissionRequest { request_id: u64, title: String, options: Vec<PermissionOption> }, TurnEnded { stop_reason: String }, Fatal { detail: String } }`
  - `pub struct PermissionOption { pub id: String, pub label: String }`
  - `pub trait FsBridge: Send { fn read(&mut self, path: &str) -> Result<String, String>; fn write(&mut self, path: &str, content: &str) -> Result<(), String>; }`
  - `pub struct AcpClient` c методами: `spawn(command: &str, args: &[String], cwd: &Path, on_event: Box<dyn FnMut(AgentEvent) + Send>, fs: Box<dyn FsBridge>) -> Result<AcpClient, String>`, `initialize(&mut self) -> Result<(), String>`, `new_session(&mut self, cwd: &Path) -> Result<String, String>`, `prompt(&mut self, session: &str, text: &str) -> Result<(), String>` (не ждёт конца хода — конец приходит событием `TurnEnded`), `respond_permission(&mut self, request_id: u64, option_id: &str) -> Result<(), String>`, `kill(&mut self)`

- [ ] **Step 1: Мок-агент**

`crates/gitspy-acp/tests/fixtures/mock-agent.mjs`:

```js
import { createInterface } from 'node:readline';

const out = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const pending = new Map();
let nextId = 100;
const ask = (method, params) =>
  new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    out({ jsonrpc: '2.0', id, method, params });
  });
const update = (u) => out({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 's1', update: u } });

const scenarios = {
  echo: async (id) => {
    update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'привет ' } });
    update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'мир' } });
    out({ jsonrpc: '2.0', id, result: { stopReason: 'end_turn' } });
  },
  write: async (id) => {
    update({ sessionUpdate: 'tool_call', toolCallId: 't1', title: 'Edit demo.txt', status: 'in_progress' });
    const perm = await ask('session/request_permission', {
      sessionId: 's1',
      toolCall: { toolCallId: 't1', title: 'Edit demo.txt' },
      options: [
        { optionId: 'allow', name: 'Разрешить', kind: 'allow_once' },
        { optionId: 'deny', name: 'Отклонить', kind: 'reject_once' },
      ],
    });
    const picked = perm.result && perm.result.outcome && perm.result.outcome.optionId;
    if (picked !== 'allow') {
      update({ sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'failed' });
      return out({ jsonrpc: '2.0', id, result: { stopReason: 'refusal' } });
    }
    await ask('fs/write_text_file', { sessionId: 's1', path: process.env.MOCK_DIR + '/demo.txt', content: 'из мока' });
    update({ sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'completed' });
    out({ jsonrpc: '2.0', id, result: { stopReason: 'end_turn' } });
  },
};

createInterface({ input: process.stdin }).on('line', (line) => {
  const msg = JSON.parse(line);
  if (msg.method === 'initialize') return out({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: 1, agentCapabilities: {} } });
  if (msg.method === 'session/new') return out({ jsonrpc: '2.0', id: msg.id, result: { sessionId: 's1' } });
  if (msg.method === 'session/prompt') return void scenarios[msg.params.prompt[0].text](msg.id);
  if (msg.id !== undefined && pending.has(msg.id)) {
    const resolve = pending.get(msg.id);
    pending.delete(msg.id);
    resolve(msg);
  }
});
```

- [ ] **Step 2: Падающие тесты**

`crates/gitspy-acp/tests/client.rs`:

```rust
use gitspy_acp::{AcpClient, AgentEvent, FsBridge};
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::Duration;

struct TempFs {
    written: mpsc::Sender<(String, String)>,
}

impl FsBridge for TempFs {
    fn read(&mut self, _path: &str) -> Result<String, String> {
        Ok(String::new())
    }
    fn write(&mut self, path: &str, content: &str) -> Result<(), String> {
        self.written.send((path.into(), content.into())).map_err(|e| e.to_string())
    }
}

fn fixture() -> String {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/mock-agent.mjs")
        .to_string_lossy()
        .into_owned()
}

fn start() -> (AcpClient, mpsc::Receiver<AgentEvent>, mpsc::Receiver<(String, String)>) {
    let (ev_tx, ev_rx) = mpsc::channel();
    let (fs_tx, fs_rx) = mpsc::channel();
    let mut client = AcpClient::spawn(
        "node",
        &[fixture()],
        &PathBuf::from("/tmp"),
        Box::new(move |e| {
            let _ = ev_tx.send(e);
        }),
        Box::new(TempFs { written: fs_tx }),
    )
    .expect("мок-агент должен запуститься");
    client.initialize().expect("initialize отвечает");
    (client, ev_rx, fs_rx)
}

fn drain_until<T>(rx: &mpsc::Receiver<AgentEvent>, mut pred: impl FnMut(&AgentEvent) -> Option<T>) -> T {
    loop {
        let ev = rx.recv_timeout(Duration::from_secs(5)).expect("событие обязано прийти");
        if let Some(v) = pred(&ev) {
            return v;
        }
    }
}

#[test]
fn echo_scenario_streams_chunks_and_turn_end() {
    let (mut client, events, _) = start();
    let session = client.new_session(&PathBuf::from("/tmp")).expect("сессия создаётся");
    client.prompt(&session, "echo").expect("prompt уходит");
    let mut text = String::new();
    let reason = drain_until(&events, |e| match e {
        AgentEvent::MessageChunk { text: t } => {
            text.push_str(t);
            None
        }
        AgentEvent::TurnEnded { stop_reason } => Some(stop_reason.clone()),
        _ => None,
    });
    assert_eq!(text, "привет мир", "чанки обязаны прийти по порядку");
    assert_eq!(reason, "end_turn", "ход завершается end_turn");
    client.kill();
}

#[test]
fn write_scenario_asks_permission_then_writes_through_bridge() {
    let (mut client, events, fs) = start();
    let session = client.new_session(&PathBuf::from("/tmp")).expect("сессия создаётся");
    client.prompt(&session, "write").expect("prompt уходит");
    let (request_id, option) = drain_until(&events, |e| match e {
        AgentEvent::PermissionRequest { request_id, options, .. } => {
            Some((*request_id, options[0].id.clone()))
        }
        _ => None,
    });
    client.respond_permission(request_id, &option).expect("ответ уходит");
    let (path, content) = fs.recv_timeout(Duration::from_secs(5)).expect("запись обязана дойти до моста");
    assert!(path.ends_with("demo.txt"), "путь из запроса агента, пришло: {path}");
    assert_eq!(content, "из мока", "содержимое из запроса агента");
    drain_until(&events, |e| match e {
        AgentEvent::ToolCallUpdate { status, .. } if status == "completed" => Some(()),
        _ => None,
    });
    client.kill();
}
```

- [ ] **Step 3: Прогнать — падают** (`cargo test -p gitspy-acp`, ожидание: нет `lib.rs`)

- [ ] **Step 4: Реализация**

`wire.rs` — типы конверта (`Envelope { id: Option<u64>, method: Option<String>, params/result/error: serde_json::Value }`) и построители запросов. `lib.rs`: `spawn` — `std::process::Command` со `Stdio::piped()`, `env("MOCK_DIR", …)` не звать (это фикстура ставит сама — мок читает `process.env.MOCK_DIR`, в тестах он не нужен, путь захардкожен в сценарии); поток-читатель построчно парсит stdout: ответы (`id` без `method`) кладутся в `pending: HashMap<u64, mpsc::Sender<Envelope>>`; нотификация `session/update` разбирается по `sessionUpdate` в `AgentEvent` и уходит в `on_event`; встречный запрос `fs/read_text_file`/`fs/write_text_file` исполняется через `FsBridge` и тут же отвечается (`{}` при записи, `{content}` при чтении); `session/request_permission` — событие `PermissionRequest{request_id: id из запроса}`, ответ шлёт `respond_permission` формой `{"outcome":{"outcome":"selected","optionId":…}}`. `initialize` шлёт `clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false }` — terminal выключен по спеке, встраивание xterm — следующий заход; `initialize`/`new_session` — блокирующие запросы с таймаутом 10 с через `mpsc::Receiver::recv_timeout`; `prompt` регистрирует ожидание ответа, но не блокируется: финал хода читатель превращает в `TurnEnded`, ошибку — в `Fatal`. Все записи в stdin — под `Mutex`. Мёртвый процесс — `Fatal{detail}` один раз.

- [ ] **Step 5: Тесты зелёные, ворота Rust** (`cargo test -p gitspy-acp`, clippy, fmt).

---

### Task 2: Чекпоинты в `gitspy-exec`

**Files:**
- Create: `crates/gitspy-exec/src/checkpoint.rs`
- Modify: `crates/gitspy-exec/src/lib.rs` (`pub mod checkpoint`)
- Create: `crates/gitspy-exec/tests/checkpoint.rs`

**Interfaces:**
- Consumes: существующий раннер git из `gitspy-exec` — перед кодом прочитать `crates/gitspy-exec/src/lib.rs` и соседние модули, вызывать git так же, как они (обезвреженное окружение обязательно).
- Produces:
  - `pub fn checkpoint_create(repo: &Path) -> Result<Option<String>, String>` — oid от `git stash create gitspy-checkpoint`, `None` при чистом дереве
  - `pub fn checkpoint_pin(repo: &Path, session: &str, n: u32, oid: &str) -> Result<(), String>` — `git update-ref refs/gitspy/checkpoints/<session>/<n> <oid>`
  - `pub fn checkpoint_restore(repo: &Path, oid: Option<&str>, paths: &[String]) -> Result<(), String>` — для каждого пути: `git restore --source=<oid> --worktree -- <path>`; если git отвечает, что пути в снапшоте нет, или `oid` — `None`, файл удаляется с диска

- [ ] **Step 1: Падающий тест**

`crates/gitspy-exec/tests/checkpoint.rs` — фикстура настоящим git по образцу `crates/gitspy-repo/tests/support` (прочитать и повторить локально: `git init` во временном каталоге, фиксированные даты, `-c user.name/email`, без пользовательского конфига):

```rust
use gitspy_exec::checkpoint::{checkpoint_create, checkpoint_pin, checkpoint_restore};
use std::fs;
use std::path::PathBuf;
use std::process::Command;

fn repo() -> PathBuf {
    let dir = std::env::temp_dir().join(format!("gitspy-cp-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).expect("каталог фикстуры");
    let git = |args: &[&str]| {
        let ok = Command::new("git")
            .args(args)
            .current_dir(&dir)
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .env("GIT_CONFIG_SYSTEM", "/dev/null")
            .status()
            .expect("git запускается")
            .success();
        assert!(ok, "git {args:?} обязан пройти");
    };
    git(&["init", "-q"]);
    git(&["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--allow-empty", "-q", "-m", "base"]);
    fs::write(dir.join("a.txt"), "исходное").expect("файл пишется");
    git(&["add", "a.txt"]);
    git(&["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "a"]);
    dir
}

#[test]
fn clean_tree_gives_no_checkpoint() {
    let dir = repo();
    assert_eq!(checkpoint_create(&dir).expect("вызов проходит"), None, "чистое дерево — чекпоинта нет");
}

#[test]
fn dirty_tree_checkpoint_restores_content() {
    let dir = repo();
    fs::write(dir.join("a.txt"), "правка до агента").expect("файл пишется");
    let oid = checkpoint_create(&dir).expect("вызов проходит").expect("грязное дерево даёт oid");
    checkpoint_pin(&dir, "s1", 1, &oid).expect("ссылка ставится");
    fs::write(dir.join("a.txt"), "агент сломал").expect("файл пишется");
    checkpoint_restore(&dir, Some(&oid), &["a.txt".into()]).expect("откат проходит");
    assert_eq!(
        fs::read_to_string(dir.join("a.txt")).expect("файл читается"),
        "правка до агента",
        "откат возвращает состояние на момент чекпоинта"
    );
}

#[test]
fn restore_of_agent_created_file_deletes_it() {
    let dir = repo();
    fs::write(dir.join("new.txt"), "создал агент").expect("файл пишется");
    checkpoint_restore(&dir, None, &["new.txt".into()]).expect("откат проходит");
    assert!(!dir.join("new.txt").exists(), "созданный агентом файл удаляется откатом");
}
```

- [ ] **Step 2: Прогнать — падает** (нет модуля)
- [ ] **Step 3: Реализация** по контрактам выше, git — через раннер крейта.
- [ ] **Step 4: Тесты зелёные, ворота Rust.**

---

### Task 3: Граница Tauri — `acp.rs`, `AcpEventView`, типы в `src/generated`

**Files:**
- Create: `src-tauri/src/acp.rs`
- Modify: `src-tauri/src/main.rs` (модуль + шесть команд)
- Modify: `src-tauri/src/views.rs` (или соседний файл с `#[derive(TS)]` — посмотреть, где живут типы, и положить рядом `AcpEventView`)
- Modify: `src-tauri/Cargo.toml` (`gitspy-acp`, `gitspy-exec` уже есть — проверить)
- Modify: `src/types.ts` (реэкспорт нового типа)

**Interfaces:**
- Consumes: `AcpClient`, `AgentEvent` (Task 1); `checkpoint_*` (Task 2).
- Produces команды: `acp_open(repo: String, command: String, args: Vec<String>, on_event: Channel<AcpEventView>) -> Result<u32, ErrorView>`, `acp_prompt(id: u32, text: String)`, `acp_permission(id: u32, request_id: u64, option_id: String)`, `acp_cancel(id: u32)`, `acp_kill(id: u32)`, `acp_rollback(repo: String, oid: Option<String>, paths: Vec<String>)` — все `Result<_, ErrorView>`, коды `acp.spawn` / `acp.gone` / `acp.rollback`.
- Produces тип:

```rust
#[derive(Clone, serde::Serialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export)]
pub enum AcpEventView {
    MessageChunk { text: String },
    ToolCall { id: String, title: String, status: String },
    ToolCallUpdate { id: String, status: String },
    Permission { request_id: u64, title: String, options: Vec<AcpOptionView> },
    Checkpoint { oid: Option<String>, path: String },
    TurnEnded { stop_reason: String },
    Fatal { detail: String },
}
```

  (`AcpOptionView { id, label }` рядом, тоже `TS`.)

- [ ] **Step 1:** Тип и команды. `FsBridge` границы: `read` — `std::fs::read_to_string`; `write` — если для сессии в этом ходу чекпоинта ещё нет, взять `checkpoint_create` + `checkpoint_pin` (номер хода — счётчик сессии) и отправить `Checkpoint{oid, path}` в канал, затем `std::fs::write`; путь всегда внутри `repo` (канонизировать и проверить префикс, иначе `Err`). `prompt` сбрасывает флаг «чекпоинт хода взят». Реестр сессий — `Mutex<Option<HashMap<u32, …>>>` по образцу `term.rs`.
- [ ] **Step 2:** `cargo test -p gitspy-app` — пересборка `src/generated/`, там появляется `AcpEventView.ts`; `src/types.ts` реэкспортирует.
- [ ] **Step 3:** `npm run boundary:check` зелёный; ворота Rust.

---

### Task 4: `entities/agent` — стор сессий и редьюсер ленты

**Files:**
- Create: `src/entities/agent/index.ts`
- Create: `src/entities/agent/sessions.ts`
- Create: `src/entities/agent/feed.ts`
- Create: `src/entities/agent/feed.test.ts`
- Create: `src/entities/agent/sessions.test.ts`
- Modify: `src/ipc.ts` (`acpOpen/acpPrompt/acpPermission/acpCancel/acpKill/acpRollback`)

**Interfaces:**
- Consumes: `AcpEventView` из `src/types.ts` (Task 3).
- Produces:
  - `type AgentStatus = 'working' | 'waiting' | 'ready' | 'dead'`
  - `useAgentSessions` (zustand): `{ sessions: { id: number; title: string; status: AgentStatus }[]; add(id: number, title: string): void; setStatus(id: number, status: AgentStatus): void; setTitle(id: number, title: string): void; remove(id: number): void }`
  - `type FeedItem = { kind: 'user'; text: string } | { kind: 'agent'; text: string } | { kind: 'tool'; id: string; title: string; status: string } | { kind: 'permission'; requestId: number; title: string; options: { id: string; label: string }[]; resolved: string | null } | { kind: 'checkpoint'; oid: string | null; paths: string[] } | { kind: 'ended'; reason: string }`
  - `applyEvent(items: FeedItem[], event: AcpEventView): FeedItem[]` — чистая; `resolvePermission(items: FeedItem[], requestId: number, optionId: string): FeedItem[]`
  - `statusAfter(event: AcpEventView): AgentStatus | null` — `Permission → 'waiting'`, `TurnEnded → 'ready'`, `Fatal → 'dead'`, `MessageChunk|ToolCall → 'working'`, `Checkpoint|ToolCallUpdate → null`

- [ ] **Step 1: Падающие тесты**

`feed.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyEvent, resolvePermission, statusAfter } from './feed';
import type { FeedItem } from './feed';

describe('лента агентской сессии', () => {
  it('чанки склеиваются в последний ответ агента', () => {
    let items: FeedItem[] = [{ kind: 'user', text: 'привет' }];
    items = applyEvent(items, { kind: 'messageChunk', text: 'при' });
    items = applyEvent(items, { kind: 'messageChunk', text: 'вет' });
    expect(items).toHaveLength(2);
    expect(items[1]).toEqual({ kind: 'agent', text: 'привет' });
  });

  it('обновление инструмента меняет статус по id, не добавляя строк', () => {
    let items: FeedItem[] = [];
    items = applyEvent(items, { kind: 'toolCall', id: 't1', title: 'Edit', status: 'in_progress' });
    items = applyEvent(items, { kind: 'toolCallUpdate', id: 't1', status: 'completed' });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'tool', id: 't1', status: 'completed' });
  });

  it('чекпоинты одного oid копят пути в одном элементе', () => {
    let items: FeedItem[] = [];
    items = applyEvent(items, { kind: 'checkpoint', oid: 'abc', path: 'a.txt' });
    items = applyEvent(items, { kind: 'checkpoint', oid: 'abc', path: 'b.txt' });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'checkpoint', oid: 'abc', paths: ['a.txt', 'b.txt'] });
  });

  it('ответ на разрешение резолвит карточку', () => {
    let items: FeedItem[] = [];
    items = applyEvent(items, {
      kind: 'permission',
      requestId: 5,
      title: 'Edit demo.txt',
      options: [{ id: 'allow', label: 'Разрешить' }],
    });
    items = resolvePermission(items, 5, 'allow');
    expect(items[0]).toMatchObject({ kind: 'permission', resolved: 'allow' });
  });

  it('статусы сессии выводятся из событий', () => {
    expect(statusAfter({ kind: 'permission', requestId: 1, title: '', options: [] })).toBe('waiting');
    expect(statusAfter({ kind: 'turnEnded', stopReason: 'end_turn' })).toBe('ready');
    expect(statusAfter({ kind: 'fatal', detail: 'x' })).toBe('dead');
    expect(statusAfter({ kind: 'messageChunk', text: 'x' })).toBe('working');
    expect(statusAfter({ kind: 'checkpoint', oid: null, path: 'a' })).toBeNull();
  });
});
```

Форму `AcpEventView` в тестах взять из сгенерированного типа (`camelCase`, `kind`-тег) — если генератор дал иные имена полей, тесты и редьюсер пишутся под фактический `src/generated/AcpEventView.ts`, а не под этот листинг.

`sessions.test.ts` — по образцу `entities/terminal/sessions.test.ts`: add/setStatus/remove, «remove убирает сессию, статусы чужих не трогаются».

- [ ] **Step 2: Прогнать — падают**
- [ ] **Step 3: Реализация** (`feed.ts` — редьюсер без мутаций; `sessions.ts` — zustand; `ipc.ts` — обёртки с `Channel<AcpEventView>`)
- [ ] **Step 4: Тесты зелёные, `npx tsc --noEmit`.**

---

### Task 5: `features/agent` — действия сессии

**Files:**
- Create: `src/features/agent/index.ts`
- Create: `src/features/agent/session.ts`
- Create: `src/features/agent/session.test.ts`

**Interfaces:**
- Consumes: `entities/agent` (Task 4), `ipc` (`acpOpen` и остальные).
- Produces:
  - `openAgentSession(repo: string): Promise<number>` — `acpOpen(repo, 'npx', ['@agentclientprotocol/claude-agent-acp'], onEvent)`; `onEvent` ведёт ленту в модульной `Map<number, FeedItem[]>` (`feedOf(id): FeedItem[]`, подписка `onFeed(id, cb)`), статус — через `statusAfter` в `useAgentSessions`
  - `sendPrompt(id: number, text: string): Promise<void>` — добавляет `{kind:'user'}` в ленту и зовёт `acpPrompt`
  - `answerPermission(id: number, requestId: number, optionId: string): Promise<void>` — `resolvePermission` + `acpPermission`
  - `rollbackCheckpoint(repo: string, item: { oid: string | null; paths: string[] }): Promise<void>` — `acpRollback`

- [ ] **Step 1: Падающий тест** — `session.test.ts` с `vi.mock('@/ipc')`: `sendPrompt` кладёт user-элемент и зовёт `acpPrompt` с теми же аргументами; `answerPermission` резолвит карточку в ленте и зовёт `acpPermission`; событие через колбэк `acpOpen` доводит статус сессии до `waiting` (скормить `permission`-событие).
- [ ] **Step 2: Прогнать — падает**
- [ ] **Step 3: Реализация**
- [ ] **Step 4: Зелёные, tsc.**

---

### Task 6: `AgentSessionView` в доке, профиль «claude · ACP»

**Files:**
- Create: `src/widgets/AgentSessionView.tsx`
- Create: `src/widgets/AgentSessionView.test.tsx`
- Modify: `src/widgets/TerminalDock.tsx` (смешанный список сессий, панель по kind, пункт меню)
- Modify: `src/features/terminal/profiles.ts` + `profiles.test.ts` (`kind: 'term' | 'acp'`, дефолт без изменений поведения)
- Modify: `src/locales/en/common.json`

**Interfaces:**
- Consumes: всё из Task 4–5; части `ListRow`/`PanelBar`/`InlineNote`; `Icon`.
- Produces: `<AgentSessionView id={number} repo={string} />`; в списке дока агентские сессии — строки с `✳`-иконкой (`Icon.sparkle` завести в `src/icons.ts` из lucide `Sparkles`), статусной точкой (`waiting` — `bg-modified` с пульсом, `working` — `bg-added`, `ready` — приглушённая, `dead` — `bg-deleted`); активная агентская сессия рендерит ленту вместо терминала.

- [ ] **Step 1: Падающий тест** — рендер `AgentSessionView` с лентой из `feedOf`-мока: видны текст агента, карточка инструмента, карточка разрешения с двумя кнопками; клик по кнопке зовёт `answerPermission` (мок `features/agent`).
- [ ] **Step 2: Прогнать — падает**
- [ ] **Step 3: Реализация** — лента: `user` — строка с левой рамкой `border-l-2 border-primary/40 pl-2`; `agent` — абзац; `tool` — строка-карточка `border border-border bg-card rounded-md h-7 px-2` с точкой статуса; `permission` — карточка `border-modified/40 bg-modified/5` с кнопками (вариант `xs` кнопки shadcn), резолв прячет кнопки; `checkpoint` — строка `text-2xs text-muted-foreground` с действием отката; `ended` — `InlineNote`. Внизу — `input` + кнопка отправки (`h-7`, как в мокапе `acp-session`). Ключи: `agent.session`, `agent.waiting`, `agent.working`, `agent.ready`, `agent.dead`, `agent.send`, `agent.placeholder`, `agent.allow`, `agent.deny`, `agent.rollback`, `agent.checkpoint`, `agent.newAcp`.
- [ ] **Step 4: Интеграция в док** — `TerminalDock`: активная запись — `{ kind: 'term' | 'agent'; id: number }`; список строит оба стора; «+ ▾» получает пункт `t('agent.newAcp')` → `openAgentSession(repo)`.
- [ ] **Step 5: Зелёные: vitest виджетов, tsc, lint, i18n:check.**

---

### Task 7: Полные ворота

- [ ] **Step 1:** `npm run build` целиком зелёный (boundary пересоберёт `AcpEventView`).
- [ ] **Step 2:** `cargo test` workspace, clippy `-D warnings`, `cargo fmt --all -- --check`.
- [ ] **Step 3:** Ничего не коммитить; итог — `git status --short`.

---

### Task 8: Смоук с настоящим `claude-agent-acp`

- [ ] **Step 1:** Юнит вне приложения: маленький бинарь-пример `crates/gitspy-acp/examples/smoke.rs` — `AcpClient::spawn("npx", ["-y", "@agentclientprotocol/claude-agent-acp"], repo, …)`, `initialize`, `new_session`, `prompt("Ответь одним словом: ок")`, ждать `TurnEnded` ≤ 120 с, печатать события в stdout.
- [ ] **Step 2:** `cargo run -p gitspy-acp --example smoke -- /Users/pavelerohovets/projects/gitspy` — успех: пришли `MessageChunk` и `TurnEnded`. Провал протокола (расхождение форм сообщений) — чинить `wire.rs` по фактическому проводу и перегнать тесты Task 1. Отсутствие авторизации/бинаря — не провал задачи: доложить как ограничение среды с точной ошибкой.
- [ ] **Step 3:** Числа и факты — в отчёт: время до первого чанка, до конца хода, отличия провода от мока, если были.
